import java.lang.reflect.*;
import java.util.*;
import com.ruoyi.web.controller.system.SysProfileController;
import com.ruoyi.system.service.ISysUserService;
import com.ruoyi.framework.web.service.TokenService;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.common.core.domain.entity.*;
import com.ruoyi.common.core.domain.model.LoginUser;
import com.ruoyi.common.exception.ServiceException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.alibaba.fastjson2.JSON;

public class ProfileFreshDataProbe {
  static final List<Map<String,Object>> checks=new ArrayList<>();
  static void check(String name,boolean pass){checks.add(Map.of("name",name,"passed",pass));}
  static class NoSessionWrite extends TokenService {
    @Override public void setLoginUser(LoginUser user){throw new AssertionError("GET must not write a login session");}
  }
  static SysUser user(long id,String status,String deleted,long time,String nickname){
    SysUser u=new SysUser();u.setUserId(id);u.setUserName("qa_profile_current");u.setNickName(nickname);u.setStatus(status);u.setDelFlag(deleted);u.setCreateTime(new Date(time));u.setPassword("not-an-output-secret");
    SysDept d=new SysDept();d.setDeptId(103L);d.setDeptName("最新部门");u.setDept(d);u.setDeptId(103L);u.setRoles(List.of());return u;
  }
  public static void main(String[] args)throws Exception{
    for(String scenario:List.of("fresh-database","missing","disabled","deleted")){
      SysUser cached=user(114,"0","0",1794933160000L,"旧昵称");
      cached.setUserName("qa_profile_old");
      Set<String> permissions=new HashSet<>(Set.of("cached:permission"));
      LoginUser login=new LoginUser(114L,103L,cached,permissions);
      SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(login,null,List.of()));
      SysUser fresh=scenario.equals("missing")?null:user(114,scenario.equals("disabled")?"1":"0",scenario.equals("deleted")?"2":"0",1794942160000L,"最新昵称");
      List<String> calls=new ArrayList<>();
      ISysUserService service=(ISysUserService)Proxy.newProxyInstance(ProfileFreshDataProbe.class.getClassLoader(),new Class[]{ISysUserService.class},(p,m,a)->{
        calls.add(m.getName()+":"+(a==null?"":String.valueOf(a[0])));
        return switch(m.getName()){
          case "selectUserById" -> {if(!Long.valueOf(114).equals(a[0]))throw new AssertionError("Query must use authenticated userId");yield fresh;}
          case "selectUserRoleGroup" -> "最新角色组";
          case "selectUserPostGroup" -> "最新岗位组";
          default -> throw new AssertionError("Unexpected service method "+m.getName());
        };
      });
      SysProfileController controller=new SysProfileController();
      for(var pair:Map.of("userService",service,"tokenService",new NoSessionWrite()).entrySet()){Field f=SysProfileController.class.getDeclaredField(pair.getKey());f.setAccessible(true);f.set(controller,pair.getValue());}
      AjaxResult response=controller.profile();
      String prefix=scenario+":";
      check(prefix+"current user selected by authenticated id",calls.contains("selectUserById:114"));
      if(scenario.equals("fresh-database")){
        check(prefix+"success",Integer.valueOf(200).equals(response.get("code")));
        SysUser actual=(SysUser)response.get("data");
        check(prefix+"fresh createTime",actual!=null&&actual.getCreateTime().getTime()==1794942160000L);
        check(prefix+"fresh nickname and complete department",actual!=null&&"最新昵称".equals(actual.getNickName())&&"最新部门".equals(actual.getDept().getDeptName()));
        check(prefix+"role display queried for current username",calls.contains("selectUserRoleGroup:qa_profile_current")&&"最新角色组".equals(response.get("roleGroup")));
        check(prefix+"post display queried for current username",calls.contains("selectUserPostGroup:qa_profile_current")&&"最新岗位组".equals(response.get("postGroup")));
        check(prefix+"password excluded by actual Jackson serialization",!new ObjectMapper().writeValueAsString(response).contains("not-an-output-secret"));
      }else{
        check(prefix+"explicit unauthorized",Integer.valueOf(401).equals(response.get("code")));
        check(prefix+"no cached profile leaked",!response.containsKey("data"));
        check(prefix+"no role or post lookup",calls.size()==1);
      }
      check(prefix+"cached object identity preserved",login.getUser()==cached);
      check(prefix+"cached date and nickname untouched",cached.getCreateTime().getTime()==1794933160000L&&"旧昵称".equals(cached.getNickName()));
      check(prefix+"authorization set untouched",login.getPermissions()==permissions&&permissions.equals(Set.of("cached:permission")));
      SecurityContextHolder.clearContext();
    }
    try{new SysProfileController().profile();check("anonymous:existing unauthorized exception",false);}catch(ServiceException ex){check("anonymous:existing unauthorized exception",Integer.valueOf(401).equals(ex.getCode()));}
    long passed=checks.stream().filter(c->Boolean.TRUE.equals(c.get("passed"))).count();
    System.out.println(JSON.toJSONString(Map.of("assertions",checks.size(),"passed",passed,"failed",checks.size()-passed,"checks",checks)));
    if(passed!=checks.size())System.exit(1);
  }
}
