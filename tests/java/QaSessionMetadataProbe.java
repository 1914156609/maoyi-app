// Read-only metadata projection for RuoYi Fastjson typed JSON. Never prints tokens/passwords/keys.
import java.nio.charset.StandardCharsets;
import java.util.*;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
public class QaSessionMetadataProbe {
 public static void main(String[] args)throws Exception{
  List<Map<String,Object>> output=new ArrayList<>();
  for(String line:new String(System.in.readAllBytes(),StandardCharsets.UTF_8).split("\\R")){
   if(line.isBlank())continue;
   JSONObject value=JSON.parseObject(new String(Base64.getDecoder().decode(line),StandardCharsets.UTF_8));
   Map<String,Object> row=new LinkedHashMap<>();
   for(String key:List.of("userId","loginTime","expireTime","ipaddr","browser"))row.put(key,value.get(key));
   output.add(row);
  }
  System.out.println(JSON.toJSONString(output));
 }
}
