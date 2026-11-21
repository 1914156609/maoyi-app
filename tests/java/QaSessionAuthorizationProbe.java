// Read-only, credential-free projection for the explicitly scoped QA107/113 role relay.
import java.nio.charset.StandardCharsets;
import java.util.*;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
public class QaSessionAuthorizationProbe {
 public static void main(String[] args)throws Exception{
  List<Map<String,Object>> output=new ArrayList<>();
  for(String line:new String(System.in.readAllBytes(),StandardCharsets.UTF_8).split("\\R")){
   if(line.isBlank())continue;
   JSONObject value=JSON.parseObject(new String(Base64.getDecoder().decode(line),StandardCharsets.UTF_8));
   long id=value.getLongValue("userId");if(id!=107&&id!=113)continue;
   Map<String,Object> row=new LinkedHashMap<>();row.put("userId",id);row.put("loginTime",value.get("loginTime"));row.put("expireTime",value.get("expireTime"));row.put("permissions",value.get("permissions"));
   JSONObject user=value.getJSONObject("user");List<Map<String,Object>> roles=new ArrayList<>();
   if(user!=null&&user.getJSONArray("roles")!=null)for(Object raw:user.getJSONArray("roles")){JSONObject role=(JSONObject)raw;Map<String,Object> safe=new LinkedHashMap<>();for(String key:List.of("roleId","roleKey","status"))safe.put(key,role.get(key));roles.add(safe);}
   row.put("cachedRoles",roles);output.add(row);
  }
  System.out.println(JSON.toJSONString(output));
 }
}
