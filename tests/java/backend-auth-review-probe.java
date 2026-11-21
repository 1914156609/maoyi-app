import java.lang.reflect.*;
import java.util.*;
import com.alibaba.fastjson2.JSON;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import com.ruoyi.common.core.domain.entity.SysUser;
import com.ruoyi.common.core.domain.model.LoginUser;
import com.ruoyi.common.utils.SecurityUtils;
import com.ruoyi.framework.security.filter.JwtAuthenticationTokenFilter;
import com.ruoyi.framework.web.service.*;
import com.ruoyi.system.service.ISysUserService;
import org.springframework.security.core.context.SecurityContextHolder;
class BackendAuthReviewProbe {
 static final List<Map<String,Object>> checks=new ArrayList<>();static SysUser current;static int revoke,refresh,chainCalls;static boolean throwRead;
 static void check(String n,boolean p){checks.add(Map.of("name",n,"passed",p));}
 static void inject(Object o,String n,Object v)throws Exception{try{Field f=JwtAuthenticationTokenFilter.class.getDeclaredField(n);f.setAccessible(true);f.set(o,v);}catch(NoSuchFieldException absent){if(n.equals("tokenService"))throw absent;}}
 @SuppressWarnings("unchecked") static<T>T proxy(Class<T> t,InvocationHandler h){return(T)Proxy.newProxyInstance(t.getClassLoader(),new Class[]{t},h);}
 static class Filter extends JwtAuthenticationTokenFilter{void run(HttpServletRequest req,HttpServletResponse res,FilterChain chain)throws Exception{super.doFilterInternal(req,res,chain);}}
 public static void main(String[] args)throws Exception{
  for(String mode:List.of("anonymous","active","disabled","deleted","missing","dbError")){
   revoke=refresh=chainCalls=0;throwRead=mode.equals("dbError");SecurityContextHolder.clearContext();
   SysUser cached=new SysUser(9999L);cached.setUserName("review");cached.setStatus("0");cached.setDelFlag("0");cached.setDeptId(103L);
   current=new SysUser(9999L);current.setUserName("review");current.setStatus(mode.equals("disabled")?"1":"0");current.setDelFlag(mode.equals("deleted")?"2":"0");current.setDeptId(105L);
   if(mode.equals("missing"))current=null;
   LoginUser login=new LoginUser(9999L,103L,cached,Set.of("stale:write"));login.setToken("synthetic");Filter f=new Filter();
   inject(f,"tokenService",new TokenService(){public LoginUser getLoginUser(HttpServletRequest r){return mode.equals("anonymous")?null:login;}public void delLoginUser(String t){revoke++;}public void verifyToken(LoginUser l){refresh++;}});
   inject(f,"userService",proxy(ISysUserService.class,(o,m,a)->{if(throwRead)throw new IllegalStateException("synthetic database outage");return current;}));
   inject(f,"permissionService",new SysPermissionService(){public Set<String> getMenuPermission(SysUser u){return Set.of("current:read");}});
   HttpServletRequest request=proxy(HttpServletRequest.class,(o,m,a)->m.getName().equals("getRemoteAddr")?"127.0.0.1":null);HttpServletResponse response=proxy(HttpServletResponse.class,(o,m,a)->null);
   boolean threw=false;try{f.run(request,response,(req,res)->chainCalls++);}catch(IllegalStateException expected){threw=true;}
   if(mode.equals("anonymous"))check("anonymous chain remains reachable without database read",chainCalls==1&&SecurityUtils.getAuthentication()==null&&refresh==0);
   else if(mode.equals("active")){check("active authentication uses persisted user and department",SecurityUtils.getAuthentication()!=null&&login.getUser()==current&&Long.valueOf(105L).equals(login.getDeptId()));check("revoked cached permission replaced before authorization",login.getPermissions().equals(Set.of("current:read"))&&chainCalls==1&&refresh==1);}
   else if(mode.equals("dbError"))check("database outage fails closed before protected chain",threw&&chainCalls==0&&SecurityUtils.getAuthentication()==null);
   else check(mode+" token revoked and no identity installed",chainCalls==1&&revoke==1&&refresh==0&&SecurityUtils.getAuthentication()==null);
  }
  long passed=checks.stream().filter(x->Boolean.TRUE.equals(x.get("passed"))).count();System.out.println(JSON.toJSONString(Map.of("kind","actual authentication filter, synthetic token/database/servlet boundaries; no HTTP/UI", "assertions",checks.size(),"passed",passed,"failed",checks.size()-passed,"checks",checks)));SecurityContextHolder.clearContext();if(passed!=checks.size())System.exit(1);
 }
}
