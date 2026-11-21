import java.lang.reflect.*;
import java.util.*;
import jakarta.validation.*;
import com.alibaba.fastjson2.JSON;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.common.core.domain.entity.SysUser;
import com.ruoyi.common.core.domain.model.LoginUser;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.common.utils.SecurityUtils;
import com.ruoyi.framework.web.service.TokenService;
import com.ruoyi.system.service.ISysUserService;
import com.ruoyi.web.controller.system.SysProfileController;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

class BackendProfileReviewProbe {
 static final List<Map<String,Object>> checks=new ArrayList<>();
 static void check(String name,boolean passed){checks.add(Map.of("name",name,"passed",passed));}
 static void inject(Object o,String name,Object value)throws Exception{try{Field f=o.getClass().getDeclaredField(name);f.setAccessible(true);f.set(o,value);}catch(NoSuchFieldException absent){if(!name.equals("validator"))throw absent;}}
 @SuppressWarnings("unchecked") static<T>T proxy(Class<T> type,InvocationHandler h){return(T)Proxy.newProxyInstance(type.getClassLoader(),new Class[]{type},h);}
 static SysUser submitted,dbUser,cached;static int updates,pwdWrites,cacheWrites;
 static SysProfileController setup()throws Exception{
  updates=pwdWrites=cacheWrites=0;submitted=null;
  cached=new SysUser(9999L);cached.setUserName("review_profile");cached.setNickName("旧昵称");cached.setDeptId(103L);cached.setPassword("cached-password-hash");cached.setStatus("0");cached.setDelFlag("0");cached.setAvatar("old-avatar");
  dbUser=new SysUser(9999L);dbUser.setUserName("review_profile");dbUser.setNickName("当前昵称");dbUser.setDeptId(105L);dbUser.setPassword(SecurityUtils.encryptPassword("ReviewOld123"));dbUser.setStatus("0");dbUser.setDelFlag("0");
  LoginUser login=new LoginUser(9999L,103L,cached,Set.of("test:profile"));SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(login,null,login.getAuthorities()));
  SysProfileController controller=new SysProfileController();
  inject(controller,"userService",proxy(ISysUserService.class,(o,m,a)->switch(m.getName()){
   case "selectUserById"->dbUser;
   case "checkPhoneUnique","checkEmailUnique"->true;
   case "updateUserProfile"->{submitted=(SysUser)a[0];updates++;yield 1;}
   case "resetUserPwd"->{pwdWrites++;yield 1;}
   default->null;
  }));
  inject(controller,"tokenService",new TokenService(){@Override public void setLoginUser(LoginUser user){cacheWrites++;}});
  inject(controller,"validator",Validation.buildDefaultValidatorFactory().getValidator());return controller;
 }
 static SysUser payload(){SysUser u=new SysUser(1L);u.setNickName("资料验收");u.setEmail("review@example.com");u.setPhonenumber("13912345678");u.setSex("1");u.setPassword("injected");u.setStatus("1");u.setDeptId(200L);return u;}
 static boolean rejected(Runnable action){try{action.run();return false;}catch(ServiceException expected){return true;}}
 public static void main(String[] args)throws Exception{
  SysProfileController c=setup();AjaxResult result=c.updateProfile(payload());
  check("valid profile saves once",Integer.valueOf(200).equals(result.get("code"))&&updates==1);
  check("profile request cannot target another identity",submitted!=null&&Long.valueOf(9999L).equals(submitted.getUserId()));
  check("profile write excludes password, status, department, avatar",submitted!=null&&submitted.getPassword()==null&&submitted.getStatus()==null&&submitted.getDeptId()==null&&submitted.getAvatar()==null);
  check("profile cache updated only after persistence",cacheWrites==1&&"资料验收".equals(cached.getNickName()));
  for(String field:List.of("blankNick","longNick","email","phone","sex")){
   c=setup();SysUser u=payload();switch(field){case "blankNick"->u.setNickName(" ");case "longNick"->u.setNickName("x".repeat(31));case "email"->u.setEmail("bad");case "phone"->u.setPhonenumber("1|123456789");case "sex"->u.setSex("9");}
   final SysProfileController target=c;check("invalid profile "+field+" rejected before DB/cache",rejected(()->target.updateProfile(u))&&updates==0&&cacheWrites==0&&"旧昵称".equals(cached.getNickName()));
  }
  for(String state:List.of("disabled","deleted","missing")){
   c=setup();if(state.equals("disabled"))dbUser.setStatus("1");else if(state.equals("deleted"))dbUser.setDelFlag("2");else dbUser=null;
   final SysProfileController target=c;check(state+" profile cannot write",rejected(()->target.updateProfile(payload()))&&updates==0&&cacheWrites==0);
  }
  for(String password:List.of("x","x".repeat(21),"Valid<123")){
   c=setup();final SysProfileController target=c;check("invalid password length="+password.length()+" rejected without write",rejected(()->target.updatePwd(Map.of("oldPassword","ReviewOld123","newPassword",password)))&&pwdWrites==0&&cacheWrites==0);
  }
  c=setup();result=c.updatePwd(Map.of("oldPassword","ReviewOld123","newPassword","ReviewNew123"));check("valid password follows current persisted old hash",Integer.valueOf(200).equals(result.get("code"))&&pwdWrites==1&&cacheWrites==1);
  c=setup();try{result=c.updatePwd(Map.of("newPassword","ReviewNew123"));check("missing old password is explicit rejection",!Integer.valueOf(200).equals(result.get("code"))&&pwdWrites==0);}catch(ServiceException valid){check("missing old password is explicit rejection",pwdWrites==0);}catch(Exception invalid){check("missing old password is explicit rejection",false);}
  long passed=checks.stream().filter(x->Boolean.TRUE.equals(x.get("passed"))).count();System.out.println(JSON.toJSONString(Map.of("kind","actual controller with synthetic service/TokenService boundaries; no HTTP/UI", "assertions",checks.size(),"passed",passed,"failed",checks.size()-passed,"checks",checks)));SecurityContextHolder.clearContext();if(passed!=checks.size())System.exit(1);
 }
}
