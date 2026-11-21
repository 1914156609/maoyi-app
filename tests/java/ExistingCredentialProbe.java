import java.nio.charset.StandardCharsets;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
public class ExistingCredentialProbe {
  public static void main(String[] args)throws Exception{
    JSONObject input=JSON.parseObject(new String(System.in.readAllBytes(),StandardCharsets.UTF_8));
    System.out.println(new BCryptPasswordEncoder().matches(input.getString("password"),input.getString("hash")));
  }
}
