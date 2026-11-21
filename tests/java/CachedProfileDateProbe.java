import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;

// Parse only selected date/identity fields from a cached LoginUser received on stdin.
public class CachedProfileDateProbe {
 public static void main(String[] args) throws Exception {
  TimeZone.setDefault(TimeZone.getTimeZone("Asia/Calcutta"));
  String text=new String(System.in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
  JSONObject root=JSON.parseObject(text),user=root.getJSONObject("user");
  Map<String,Object> result=new LinkedHashMap<>();
  result.put("userId",user.getLong("userId"));
  Date created=user.getDate("createTime");
  result.put("cachedCreateTimeEpoch",created.getTime());
  result.put("effectiveCreateTimeInCurrentJvmZone",new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(created));
  result.put("zone",TimeZone.getDefault().getID());
  System.out.println(JSON.toJSONString(result));
 }
}
