import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.context.support.StaticMessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.web.context.request.*;
import org.springframework.security.authentication.*;
import com.ruoyi.maoyi.*;
import com.ruoyi.common.constant.Constants;
import com.ruoyi.common.core.domain.entity.SysUser;
import com.ruoyi.common.core.domain.model.LoginUser;
import com.ruoyi.common.utils.spring.SpringUtils;
import com.ruoyi.common.utils.http.UserAgentUtils;
import com.ruoyi.framework.manager.AsyncManager;
import com.ruoyi.framework.manager.factory.AsyncFactory;
import com.ruoyi.framework.security.context.AuthenticationContextHolder;
import com.ruoyi.framework.web.service.*;
import com.ruoyi.system.domain.SysLogininfor;
import com.ruoyi.system.service.ISysLogininforService;
import com.alibaba.fastjson2.JSON;

public class EmployeeLoginAuditProbe {
 static final String PASSWORD="synthetic-not-a-real-password",TOKEN="synthetic-not-a-real-token";
 static final List<Map<String,Object>> checks=new ArrayList<>();
 static final List<SysLogininfor> records=new ArrayList<>();
 static void check(String name,boolean pass){checks.add(Map.of("name",name,"passed",pass));}
 static class ImmediateScheduler extends ScheduledThreadPoolExecutor {
  ImmediateScheduler(){super(1);}
  @Override public ScheduledFuture<?> schedule(Runnable task,long delay,TimeUnit unit){task.run();return super.schedule(()->{},0,TimeUnit.MILLISECONDS);}
 }
 static void request(String agent,String ip){
  HttpServletRequest request=(HttpServletRequest)Proxy.newProxyInstance(EmployeeLoginAuditProbe.class.getClassLoader(),new Class[]{HttpServletRequest.class},(p,m,a)->switch(m.getName()){
   case "getHeader" -> "User-Agent".equalsIgnoreCase(String.valueOf(a[0]))?agent:null;
   case "getRemoteAddr" -> ip;
   case "getMethod" -> "POST";
   case "getRequestURI" -> "/api/auth/login";
   default -> m.getReturnType()==boolean.class?false:m.getReturnType()==int.class?0:null;
  });
  RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
 }
 public static void main(String[] args)throws Exception{
  ImmediateScheduler scheduler=new ImmediateScheduler();
  try{
   DefaultListableBeanFactory beans=new DefaultListableBeanFactory();beans.registerSingleton("scheduledExecutorService",scheduler);
   ISysLogininforService service=(ISysLogininforService)Proxy.newProxyInstance(EmployeeLoginAuditProbe.class.getClassLoader(),new Class[]{ISysLogininforService.class},(p,m,a)->{if(m.getName().equals("insertLogininfor")){records.add((SysLogininfor)a[0]);return null;}throw new AssertionError("Unexpected audit service operation");});
   beans.registerSingleton("qaAuditRecorder",service);StaticMessageSource messages=new StaticMessageSource();messages.addMessage("user.login.success",Locale.CHINA,"登录成功");messages.addMessage("user.password.not.match",Locale.CHINA,"用户不存在/密码错误");beans.registerSingleton("messageSource",messages);new SpringUtils().postProcessBeanFactory(beans);LocaleContextHolder.setLocale(Locale.CHINA);
   for(String scenario:List.of("success","success-other-source","precheck-failure","authentication-failure","disabled-user","token-failure","profile-failure","metadata-failure")){
    records.clear();List<Long> metadataIds=new ArrayList<>();int[] issued={0};
    String agent=scenario.equals("success-other-source")?"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/120.0":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/130.0.0.0 Safari/537.36";
    String ip=scenario.equals("success-other-source")?"10.2.3.4":"127.0.0.7";request(agent,ip);
    SysUser user=new SysUser();user.setUserId(701L);user.setDeptId(103L);user.setUserName("qa_canonical_identity");user.setNickName("Audit probe");user.setStatus("0");user.setDelFlag("0");
    LoginUser login=new LoginUser(701L,103L,user,Set.of());
    SysLoginService loginService=new SysLoginService(){
     @Override public void loginPreCheck(String name,String password){if(scenario.equals("precheck-failure")){AsyncManager.me().execute(AsyncFactory.recordLogininfor(name,Constants.LOGIN_FAIL,"既有前置失败"));throw new IllegalArgumentException("Precheck");}}
     @Override public void recordLoginInfo(Long id){if(scenario.equals("metadata-failure"))throw new IllegalStateException("Metadata failed");metadataIds.add(id);}
    };
    // Production AuthenticationManager/PasswordService does NOT write a login audit itself.
    AuthenticationManager auth=a->{if(scenario.equals("authentication-failure"))throw new BadCredentialsException(PASSWORD);if(scenario.equals("disabled-user"))throw new DisabledException(TOKEN);return new UsernamePasswordAuthenticationToken(login,null,List.of());};
    TokenService tokens=new TokenService(){@Override public String createToken(LoginUser l){if(scenario.equals("token-failure"))throw new IllegalStateException("Token failure");issued[0]++;l.setExpireTime(999999L);return TOKEN;}};
    SysPermissionService permissions=new SysPermissionService(){@Override public Set<String> getRolePermission(SysUser u){if(scenario.equals("profile-failure"))throw new IllegalStateException("Profile failure");return Set.of();}@Override public Set<String> getMenuPermission(SysUser u){return Set.of();}};
    MaoyiIdentity identity=new MaoyiIdentity(null,permissions,auth,tokens,loginService,null){@Override public void limit(String key,int max){}};
    Map<String,Object> output=null;Exception failure=null;try{output=identity.employee("qa_input_alias",PASSWORD);}catch(Exception e){failure=e;}
    String prefix=scenario+":";
    if(scenario.startsWith("success")){
     check(prefix+"successful token response",failure==null&&output!=null&&TOKEN.equals(output.get("token"))&&issued[0]==1);
     check(prefix+"one success audit",records.size()==1&&"0".equals(records.get(0).getStatus()));
     check(prefix+"canonical authenticated principal",records.size()==1&&"qa_canonical_identity".equals(records.get(0).getUserName()));
     check(prefix+"standard translated message",records.size()==1&&"登录成功".equals(records.get(0).getMsg()));
     check(prefix+"real request source metadata",records.size()==1&&ip.equals(records.get(0).getIpaddr())&&UserAgentUtils.getBrowser(agent).equals(records.get(0).getBrowser())&&UserAgentUtils.getOperatingSystem(agent).equals(records.get(0).getOs()));
     check(prefix+"same authenticated login metadata id",metadataIds.equals(List.of(701L)));
    }else if(scenario.equals("precheck-failure")||scenario.equals("authentication-failure")||scenario.equals("disabled-user")){
     check(prefix+"unauthorized contract preserved",failure instanceof ApiProblem&&((ApiProblem)failure).status==401);
     check(prefix+"exactly one failure audit",records.size()==1&&"1".equals(records.get(0).getStatus()));
     check(prefix+"submitted account and request source",records.size()==1&&"qa_input_alias".equals(records.get(0).getUserName())&&ip.equals(records.get(0).getIpaddr()));
     check(prefix+"safe message without exception detail",records.size()==1&&(scenario.equals("precheck-failure")?"既有前置失败":"用户不存在/密码错误").equals(records.get(0).getMsg()));
     check(prefix+"no token or login metadata",issued[0]==0&&metadataIds.isEmpty());
    }else{
     check(prefix+"failure propagates",failure!=null);
     check(prefix+"no premature success audit",records.isEmpty());
    }
    check(prefix+"authentication context cleared",AuthenticationContextHolder.getContext()==null);
    check(prefix+"no credential or token in audit",records.stream().noneMatch(r->JSON.toJSONString(r).contains(PASSWORD)||JSON.toJSONString(r).contains(TOKEN)));
   }
  }finally{RequestContextHolder.resetRequestAttributes();LocaleContextHolder.resetLocaleContext();scheduler.shutdownNow();}
  long passed=checks.stream().filter(x->Boolean.TRUE.equals(x.get("passed"))).count();System.out.println(JSON.toJSONString(Map.of("assertions",checks.size(),"passed",passed,"failed",checks.size()-passed,"checks",checks)));
  if(passed!=checks.size())System.exit(1);
 }
}
