import java.util.*;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.constraints.Size;
import com.alibaba.fastjson2.JSON;
import com.ruoyi.common.constant.UserConstants;
import com.ruoyi.common.core.domain.entity.SysUser;
class BackendUsernameReviewProbe {
 public static void main(String[] args)throws Exception{
  Validator validator=Validation.buildDefaultValidatorFactory().getValidator();List<Map<String,Object>> checks=new ArrayList<>();
  Size rule=SysUser.class.getMethod("getUserName").getAnnotation(Size.class);checks.add(Map.of("name","create/import BeanValidation min/max equals login precheck constants","passed",rule.min()==UserConstants.USERNAME_MIN_LENGTH&&rule.max()==UserConstants.USERNAME_MAX_LENGTH));
  for(int length:new int[]{1,2,20,21,30,31}){boolean accepted=validator.validateValue(SysUser.class,"userName","x".repeat(length)).isEmpty();boolean loginLengthAccepted=length>=UserConstants.USERNAME_MIN_LENGTH&&length<=UserConstants.USERNAME_MAX_LENGTH;checks.add(Map.of("name","username length "+length+" create/import and login share boundary","passed",accepted==loginLengthAccepted,"accepted",accepted));}
  long passed=checks.stream().filter(x->Boolean.TRUE.equals(x.get("passed"))).count();System.out.println(JSON.toJSONString(Map.of("kind","compiled BeanValidation and constants boundary check; no HTTP or login execution claim","assertions",checks.size(),"passed",passed,"failed",checks.size()-passed,"checks",checks)));if(passed!=checks.size())System.exit(1);
 }
}
