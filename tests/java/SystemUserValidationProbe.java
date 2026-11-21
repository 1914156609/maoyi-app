import java.lang.reflect.*;
import java.util.*;
import jakarta.validation.*;
import com.alibaba.fastjson2.JSON;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.common.core.domain.entity.SysUser;
import com.ruoyi.common.core.domain.model.LoginUser;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.common.utils.SecurityUtils;
import com.ruoyi.system.mapper.*;
import com.ruoyi.system.service.*;
import com.ruoyi.system.service.impl.*;
import com.ruoyi.web.controller.system.SysUserController;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import com.fasterxml.jackson.databind.ObjectMapper;

public class SystemUserValidationProbe {
  static final List<Map<String,Object>> checks=new ArrayList<>();
  static void check(String name,boolean pass){checks.add(Map.of("name",name,"passed",pass));}
  static void inject(Object target,String name,Object value)throws Exception{Field f=target.getClass().getDeclaredField(name);f.setAccessible(true);f.set(target,value);}
  @SuppressWarnings("unchecked") static<T>T proxy(Class<T> type,InvocationHandler h){return(T)Proxy.newProxyInstance(type.getClassLoader(),new Class[]{type},h);}
  static void actor(long id){SysUser u=new SysUser(id);u.setUserName("synthetic_actor");LoginUser login=new LoginUser(id,103L,u,Set.of());SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(login,null,List.of()));}
  static SysUser input(String name,String password){SysUser u=new SysUser();u.setUserName(name);u.setPassword(password);u.setNickName("Synthetic QA");u.setRoleIds(new Long[]{211L});return u;}
  interface Call{void run()throws Exception;}
  static boolean refused(Call call)throws Exception{try{call.run();return false;}catch(ServiceException e){return true;}}
  static class ControllerFixture{
    final SysUserController controller=new SysUserController();final List<String>writes=new ArrayList<>();String duplicate="";SysUser saved;
    ControllerFixture(Validator validator)throws Exception{
      inject(controller,"validator",validator);
      inject(controller,"deptService",proxy(ISysDeptService.class,(p,m,a)->null));
      inject(controller,"roleService",proxy(ISysRoleService.class,(p,m,a)->null));
      inject(controller,"userService",proxy(ISysUserService.class,(p,m,a)->{
        String n=m.getName();
        if(n.equals("checkUserNameUnique"))return !duplicate.equals("username");
        if(n.equals("checkPhoneUnique"))return !duplicate.equals("phone");
        if(n.equals("checkEmailUnique"))return !duplicate.equals("email");
        if(Set.of("insertUser","updateUser","resetPwd").contains(n)){writes.add(n);saved=(SysUser)a[0];return 1;}
        if(n.equals("checkUserAllowed")||n.equals("checkUserDataScope"))return null;
        throw new AssertionError("Unexpected service call "+n);
      }));
    }
  }
  static class ServiceFixture{
    final SysUserServiceImpl users=new SysUserServiceImpl();final SysRoleServiceImpl roles=new SysRoleServiceImpl();final List<String>writes=new ArrayList<>();
    ServiceFixture()throws Exception{
      inject(users,"userMapper",proxy(SysUserMapper.class,(p,m,a)->{writes.add("user:"+m.getName());if(m.getName().equals("insertUser"))((SysUser)a[0]).setUserId(2000L);return 1;}));
      SysUserRoleMapper roleMapper=proxy(SysUserRoleMapper.class,(p,m,a)->{writes.add("association:"+m.getName());return 1;});
      inject(users,"userRoleMapper",roleMapper);inject(roles,"userRoleMapper",roleMapper);
      inject(users,"userPostMapper",proxy(SysUserPostMapper.class,(p,m,a)->{writes.add("post:"+m.getName());return 1;}));
    }
  }
  public static void main(String[]args)throws Exception{
    actor(114L);ValidatorFactory factory=Validation.buildDefaultValidatorFactory();Validator validator=factory.getValidator();
    for(String name:new String[]{null,""," ","a","x".repeat(21)}){
      ControllerFixture f=new ControllerFixture(validator);check("create username boundary "+String.valueOf(name)+" rejected",refused(()->f.controller.add(input(name,"abc123"))));check("invalid username zero writes",f.writes.isEmpty());
    }
    for(String password:new String[]{null,"","abc1","abc12","x".repeat(21),"a<1234","a>1234","a\"1234","a'1234","a|1234","a\\1234"}){
      ControllerFixture f=new ControllerFixture(validator);String label=password==null?"null":"length"+password.length()+"-case"+checks.size();
      check("create invalid password "+label,refused(()->f.controller.add(input("valid_user",password))));check("invalid create password zero writes",f.writes.isEmpty());
      ControllerFixture r=new ControllerFixture(validator);SysUser body=new SysUser(2000L);body.setPassword(password);
      check("reset invalid password "+label,refused(()->r.controller.resetPwd(body)));check("invalid reset password zero writes",r.writes.isEmpty());
    }
    for(String name:List.of("ab","a".repeat(20)))for(String password:List.of("abc123","x".repeat(20),"Abc123!_-")){
      ControllerFixture f=new ControllerFixture(validator);AjaxResult result=f.controller.add(input(name,password));check("legal create boundary accepted",Integer.valueOf(200).equals(result.get("code"))&&f.writes.equals(List.of("insertUser")));check("raw password encrypted once",SecurityUtils.matchesPassword(password,f.saved.getPassword()));
    }
    for(String password:List.of("abc123","x".repeat(20),"Abc123!_-")){
      ControllerFixture f=new ControllerFixture(validator);SysUser body=new SysUser(2000L);body.setPassword(password);AjaxResult result=f.controller.resetPwd(body);
      check("reset missing username allowed with valid password",Integer.valueOf(200).equals(result.get("code"))&&f.writes.equals(List.of("resetPwd")));check("reset BCrypt matches",SecurityUtils.matchesPassword(password,f.saved.getPassword()));
    }
    ControllerFixture edit=new ControllerFixture(validator);SysUser edited=input("valid_user",null);edited.setUserId(2000L);edit.controller.edit(edited);check("ordinary edit does not require password",edit.writes.equals(List.of("updateUser")));
    for(String supplied:List.of("1234","abc12345")){
      ControllerFixture f=new ControllerFixture(validator);SysUser u=input("valid_user",supplied);u.setUserId(2000L);f.controller.edit(u);
      check("ordinary edit ignores supplied password",f.saved.getPassword()==null&&f.writes.equals(List.of("updateUser")));
    }
    ControllerFixture ownDelete=new ControllerFixture(validator);check("self delete throws logged failure",refused(()->ownDelete.controller.remove(new Long[]{114L})));check("self delete no service write",ownDelete.writes.isEmpty());
    for(String duplicate:List.of("username","phone","email"))for(boolean isEdit:List.of(false,true)){
      ControllerFixture f=new ControllerFixture(validator);f.duplicate=duplicate;SysUser u=input("valid_user","abc123");u.setPhonenumber("13800000000");u.setEmail("qa@example.test");if(isEdit)u.setUserId(2000L);
      check("duplicate "+duplicate+" "+(isEdit?"edit":"create")+" throws logged failure",refused(()->{if(isEdit)f.controller.edit(u);else f.controller.add(u);}));check("duplicate does not write",f.writes.isEmpty());
    }
    check("Password remains Jackson WRITE_ONLY",!new ObjectMapper().writeValueAsString(input("valid_user","abc123")).contains("abc123"));
    for(long acting:List.of(114L,1L)){
      actor(acting);
      for(String entry:List.of("create","edit","authRole","directRole","roleBatch")){
        ServiceFixture f=new ServiceFixture();SysUser u=input("valid_user","already-encrypted-test-placeholder");u.setUserId(2000L);u.setRoleIds(new Long[]{211L,1L});
        Call call=switch(entry){case"create"->()->f.users.insertUser(u);case"edit"->()->f.users.updateUser(u);case"authRole"->()->f.users.insertUserAuth(2000L,new Long[]{211L,1L});case"directRole"->()->f.users.insertUserRole(2000L,new Long[]{1L});default->()->f.roles.insertAuthUsers(1L,new Long[]{1L,2000L});};
        check("actor"+acting+" protected role target rejected via "+entry,refused(call));check("actor"+acting+" "+entry+" rejects before any delete/insert",f.writes.isEmpty());
      }
      for(String entry:List.of("create","edit","authRole","directRole","roleBatch")){
        ServiceFixture f=new ServiceFixture();SysUser u=input("valid_user","hash-placeholder");u.setUserId(2000L);
        switch(entry){case"create"->f.users.insertUser(u);case"edit"->f.users.updateUser(u);case"authRole"->f.users.insertUserAuth(2000L,new Long[]{211L});case"directRole"->f.users.insertUserRole(2000L,new Long[]{211L});default->f.roles.insertAuthUsers(211L,new Long[]{2000L,2001L});}
        check("actor"+acting+" ordinary role preserved via "+entry,!f.writes.isEmpty());
      }
    }
    actor(114L);ServiceFixture protectedTarget=new ServiceFixture();check("delegated actor cannot modify realadmin authRole",refused(()->protectedTarget.users.insertUserAuth(1L,new Long[]{211L})));check("realadmin existing associations untouched",protectedTarget.writes.isEmpty());
    check("delegated actor cannot assign role1 even to target1",refused(()->SysUser.checkProtectedRoleAssignment(1L,new Long[]{1L})));
    actor(1L);SysUser.checkProtectedRoleAssignment(1L,new Long[]{1L});check("real user1 reserved role self-assignment remains legal",true);
    SecurityContextHolder.clearContext();factory.close();long failures=checks.stream().filter(c->Boolean.FALSE.equals(c.get("passed"))).count();System.out.println(JSON.toJSONString(Map.of("assertions",checks.size(),"passed",checks.size()-failures,"failed",failures,"checks",checks)));if(failures>0)System.exit(1);
  }
}
