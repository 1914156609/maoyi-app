import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import com.alibaba.fastjson2.JSON;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.common.filter.XssHttpServletRequestWrapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
class BackendXssReviewProbe {
 static List<Map<String,Object>> checks=new ArrayList<>();static void check(String n,boolean p){checks.add(Map.of("name",n,"passed",p));}
 static ServletInputStream stream(String s){ByteArrayInputStream in=new ByteArrayInputStream(s.getBytes(StandardCharsets.UTF_8));return new ServletInputStream(){public int read(){return in.read();}public boolean isFinished(){return in.available()==0;}public boolean isReady(){return true;}public void setReadListener(ReadListener l){}};}
 static XssHttpServletRequestWrapper wrapper(String json){HttpServletRequest request=(HttpServletRequest)Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),new Class[]{HttpServletRequest.class},(o,m,a)->switch(m.getName()){case "getHeader"->"application/json";case "getInputStream"->stream(json);case "getParameterValues"->new String[]{" <Password> ","Valid<123"};default->null;});return new XssHttpServletRequestWrapper(request);}
 public static void main(String[] args)throws Exception{
  ObjectMapper mapper=new ObjectMapper();Map<String,Object> input=new LinkedHashMap<>();for(String key:List.of("password","oldPassword","newPassword"))input.put(key," <Password> ");input.put("nickName","<script>alert(1)</script>姓名");input.put("nested",List.of(Map.of("password","Valid<123","label","<script>bad</script>")));
  XssHttpServletRequestWrapper w=wrapper(mapper.writeValueAsString(input));var filtered=mapper.readTree(new String(w.getInputStream().readAllBytes(),StandardCharsets.UTF_8));
  for(String key:List.of("password","oldPassword","newPassword"))check(key+" stays byte-for-byte unchanged",filtered.path(key).asText().equals(input.get(key)));
  check("other text is still XSS filtered",!filtered.path("nickName").asText().contains("<script>"));check("nested credential preserved",filtered.path("nested").get(0).path("password").asText().equals("Valid<123"));check("nested other text filtered",!filtered.path("nested").get(0).path("label").asText().contains("<script>"));
  check("credential form parameter not trimmed or changed",Arrays.equals(wrapper("{}").getParameterValues("password"),new String[]{" <Password> ","Valid<123"}));
  var nested=mapper.readTree(new String(wrapper("{\"password\":{\"description\":\"<script>bad</script>\",\"newPassword\":\"Valid<123\"}}").getInputStream().readAllBytes(),StandardCharsets.UTF_8));
  check("credential-named object still filters its ordinary text children",!nested.path("password").path("description").asText().contains("<script>"));
  check("nested text credential stays unchanged inside credential-named object",nested.path("password").path("newPassword").asText().equals("Valid<123"));
  String malformed="{\"password\":\"Valid<123\"} false";check("trailing malformed JSON remains for controller to reject",new String(wrapper(malformed).getInputStream().readAllBytes(),StandardCharsets.UTF_8).equals(malformed));
  long passed=checks.stream().filter(x->Boolean.TRUE.equals(x.get("passed"))).count();System.out.println(JSON.toJSONString(Map.of("kind","actual XSS request wrapper with synthetic servlet input; no live credentials", "assertions",checks.size(),"passed",passed,"failed",checks.size()-passed,"checks",checks)));if(passed!=checks.size())System.exit(1);
 }
}
