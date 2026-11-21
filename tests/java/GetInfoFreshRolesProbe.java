import java.lang.reflect.*;
import java.util.*;
import com.ruoyi.web.controller.system.SysLoginController;
import com.ruoyi.system.service.*;
import com.ruoyi.framework.web.service.*;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.common.core.domain.entity.*;
import com.ruoyi.common.core.domain.model.LoginUser;
import com.ruoyi.common.exception.ServiceException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.alibaba.fastjson2.JSON;

public class GetInfoFreshRolesProbe {
  static final List<Map<String,Object>> checks = new ArrayList<>();
  static void check(String name, boolean pass) { checks.add(Map.of("name", name, "passed", pass)); }
  static void inject(Object owner, String field, Object value) throws Exception {
    try { Field f=owner.getClass().getDeclaredField(field); f.setAccessible(true); f.set(owner,value); }
    catch (NoSuchFieldException ex) { if (!field.equals("userService")) throw ex; }
  }
  @SuppressWarnings("unchecked")
  static <T> T proxy(Class<T> type, InvocationHandler handler) {
    return (T) Proxy.newProxyInstance(type.getClassLoader(), new Class[]{type}, handler);
  }
  static SysRole role(long id, String key, String status) {
    SysRole r=new SysRole(); r.setRoleId(id); r.setRoleKey(key); r.setStatus(status); r.setDataScope("1"); return r;
  }
  static SysUser user(long id, List<SysRole> roles, boolean fresh) {
    SysUser u=new SysUser(); u.setUserId(id); u.setUserName("qa_current_user"); u.setNickName(fresh?"数据库当前资料":"旧登录资料");
    u.setRoles(roles); u.setStatus("0"); u.setDelFlag("0"); u.setDeptId(fresh?104L:103L);
    u.setCreateTime(new Date(fresh?1794942160000L:1794933160000L));
    u.setPwdUpdateDate(fresh?new Date():null); u.setPassword("synthetic-secret-not-for-output"); return u;
  }
  static class CaptureToken extends TokenService {
    int writes=0; LoginUser written; final List<String> deleted=new ArrayList<>();
    @Override public void refreshToken(LoginUser login) { writes++; written=login; }
    @Override public void delLoginUser(String token) { deleted.add(token); }
  }
  public static void main(String[] args) throws Exception {
    for(String scenario:List.of("grant", "revoke", "same-permissions-new-role", "disabled-role", "empty-roles", "null-cached-permissions", "super-admin", "missing", "disabled", "deleted")) {
      boolean inactive=Set.of("missing","disabled","deleted").contains(scenario);
      boolean wasGranted=Set.of("revoke","same-permissions-new-role","disabled-role").contains(scenario);
      long id=scenario.equals("super-admin")?1L:113L;
      SysUser cached=user(id,wasGranted?List.of(role(211,"employee","0"),role(217,"qa_relay","0")):List.of(role(211,"employee","0")),false);
      List<SysRole> freshRoles=switch(scenario) {
        case "grant", "null-cached-permissions" -> List.of(role(211,"employee","0"),role(217,"qa_relay","0"));
        case "same-permissions-new-role" -> List.of(role(218,"replacement","0"));
        case "disabled-role" -> List.of(role(211,"employee","0"),role(217,"qa_relay","1"));
        case "empty-roles" -> List.of();
        case "super-admin" -> List.of(role(1,"admin","0"));
        default -> List.of(role(211,"employee","0"));
      };
      SysUser fresh=scenario.equals("missing")?null:user(id,freshRoles,true);
      if(scenario.equals("disabled"))fresh.setStatus("1");
      if(scenario.equals("deleted"))fresh.setDelFlag("2");
      Set<String> originalPerms=scenario.equals("null-cached-permissions")?null:new HashSet<>(wasGranted?Set.of("maoyi:craft:list"):Set.of());
      LoginUser login=new LoginUser(id,103L,cached,originalPerms); login.setToken("synthetic-session-id"); login.setLoginTime(123L); login.setExpireTime(456L);
      login.setIpaddr("127.0.0.1"); login.setBrowser("synthetic-browser");
      SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(login,null,List.of()));
      Map<String,Object> requestAttributes=new HashMap<>();
      RequestContextHolder.setRequestAttributes(proxy(RequestAttributes.class,(p,m,a)->{
        if(m.getName().equals("setAttribute")){requestAttributes.put((String)a[0],a[1]);return null;}
        if(m.getName().equals("getAttribute"))return requestAttributes.get(a[0]);
        throw new AssertionError("Unexpected request attribute operation");
      }));
      List<String> calls=new ArrayList<>();
      ISysUserService users=proxy(ISysUserService.class,(p,m,a)->{
        if(!m.getName().equals("selectUserById") || !Long.valueOf(id).equals(a[0]))throw new AssertionError("Only authenticated userId may be read");
        calls.add("user:"+a[0]); return fresh;
      });
      ISysRoleService roles=proxy(ISysRoleService.class,(p,m,a)->{
        if(!m.getName().equals("selectRolePermissionByUserId"))throw new AssertionError("Unexpected role access");
        calls.add("roles"); Set<String> keys=new HashSet<>();
        if(fresh!=null)for(SysRole role:fresh.getRoles())if("0".equals(role.getStatus()))keys.add(role.getRoleKey()); return keys;
      });
      ISysMenuService menus=proxy(ISysMenuService.class,(p,m,a)->{
        calls.add("menus:"+m.getName());
        if(m.getName().equals("selectMenuPermsByRoleId"))return Set.of(217L,218L).contains(a[0])?Set.of("maoyi:craft:list"):Set.of();
        if(m.getName().equals("selectMenuPermsByUserId"))return Set.of();
        throw new AssertionError("Unexpected menu access");
      });
      ISysConfigService config=proxy(ISysConfigService.class,(p,m,a)->{
        if(!m.getName().equals("selectConfigByKey"))throw new AssertionError("Unexpected configuration write");
        return switch((String)a[0]){case "sys.account.initPasswordModify"->"1";case "sys.account.passwordValidateDays"->"30";default->"0";};
      });
      SysPermissionService permissions=new SysPermissionService(); inject(permissions,"roleService",roles); inject(permissions,"menuService",menus);
      CaptureToken tokens=new CaptureToken(); SysLoginController controller=new SysLoginController();
      inject(controller,"userService",users); inject(controller,"permissionService",permissions); inject(controller,"tokenService",tokens); inject(controller,"configService",config);
      String prefix=scenario+":";
      try {
        AjaxResult result=controller.getInfo();
        check(prefix+"loads authenticated identity once",calls.stream().filter(c->c.startsWith("user:")).count()==1);
        if(inactive) {
          check(prefix+"401 without cached user or permissions",Integer.valueOf(401).equals(result.get("code"))&&!result.containsKey("user")&&!result.containsKey("permissions"));
          check(prefix+"no authorization lookup or cache refresh",calls.size()==1&&tokens.writes==0);
          check(prefix+"only current invalid session revoked",tokens.deleted.equals(List.of("synthetic-session-id")));
        } else {
          Set<String> expected=scenario.equals("super-admin")?Set.of("*:*:*"):Set.of("grant","same-permissions-new-role","null-cached-permissions").contains(scenario)?Set.of("maoyi:craft:list"):Set.of();
          check(prefix+"success with fresh complete database user",Integer.valueOf(200).equals(result.get("code"))&&result.get("user")==fresh);
          check(prefix+"fresh permission result",expected.equals(result.get("permissions")));
          check(prefix+"fresh roles retained in current session",login.getUser()==fresh&&login.getUser().getRoles()==freshRoles);
          check(prefix+"current department and permissions synchronized",Long.valueOf(104).equals(login.getDeptId())&&expected.equals(login.getPermissions()));
          check(prefix+"exactly one current-session cache refresh",tokens.writes==1&&tokens.written==login&&tokens.deleted.isEmpty());
          check(prefix+"same authentication token and userId",Long.valueOf(id).equals(login.getUserId())&&"synthetic-session-id".equals(login.getToken()));
          check(prefix+"session client metadata preserved","127.0.0.1".equals(login.getIpaddr())&&"synthetic-browser".equals(login.getBrowser()));
          check(prefix+"method permission guard observes current permissions",new PermissionService().hasPermi("maoyi:craft:list")==!expected.isEmpty());
          check(prefix+"current password metadata used",Boolean.FALSE.equals(result.get("isDefaultModifyPwd"))&&Boolean.FALSE.equals(result.get("isPasswordExpired")));
          check(prefix+"password and token excluded from HTTP JSON",!new ObjectMapper().writeValueAsString(result).contains("synthetic-secret-not-for-output")&&!new ObjectMapper().writeValueAsString(result).contains("synthetic-session-id"));
        }
      } catch(Exception ex) { check(prefix+"no controller exception ("+ex.getClass().getSimpleName()+")",false); }
      check(prefix+"old snapshot is not mutated",cached.getDeptId()==103L&&"旧登录资料".equals(cached.getNickName()));
      SecurityContextHolder.clearContext();
      RequestContextHolder.resetRequestAttributes();
    }
    try { new SysLoginController().getInfo(); check("anonymous:existing unauthorized exception",false); }
    catch(ServiceException ex) { check("anonymous:existing unauthorized exception",Integer.valueOf(401).equals(ex.getCode())); }
    long passed=checks.stream().filter(c->Boolean.TRUE.equals(c.get("passed"))).count();
    System.out.println(JSON.toJSONString(Map.of("assertions",checks.size(),"passed",passed,"failed",checks.size()-passed,"checks",checks)));
    if(passed!=checks.size())System.exit(1);
  }
}
