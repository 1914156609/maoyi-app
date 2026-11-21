import java.util.*;
import com.alibaba.fastjson2.JSON;
import com.ruoyi.generator.domain.GenTable;
import com.ruoyi.generator.service.GenTableServiceImpl;
import com.ruoyi.generator.util.VelocityUtils;

// Pure in-memory regression of the actual generator service and template helper.
public class GeneratorParentMenuProbe {
 public static void main(String[] args) {
  String[] options={null,"","null","{}","{\"genView\":\"0\"}","{\"parentMenuId\":null}","{\"parentMenuId\":\"\"}","{\"parentMenuId\":0}","{\"parentMenuId\":\"0\"}","{\"parentMenuId\":3}","{\"parentMenuId\":5000}","{\"parentMenuId\":\"5000\"}"};
  long[] expected={3,3,3,3,3,3,3,0,0,3,5000,5000};
  List<Map<String,Object>> cases=new ArrayList<>();int passed=0;
  for(int i=0;i<options.length;i++){
   GenTable table=new GenTable();table.setOptions(options[i]);new GenTableServiceImpl().setTableFromOptions(table);
   long template=Long.parseLong(VelocityUtils.getParentMenuId(JSON.parseObject(options[i])));
   boolean dtoCorrect=Objects.equals(table.getParentMenuId(),expected[i]);
   boolean sameAsTemplate=Objects.equals(table.getParentMenuId(),template);
   boolean noMutation=Objects.equals(table.getOptions(),options[i]);
   passed+=(dtoCorrect?1:0)+(sameAsTemplate?1:0)+(noMutation?1:0);
   Map<String,Object> row=new LinkedHashMap<>();row.put("options",options[i]);row.put("expected",expected[i]);row.put("actualDto",table.getParentMenuId());row.put("template",template);row.put("dtoCorrect",dtoCorrect);row.put("sameAsTemplate",sameAsTemplate);row.put("originalOptionsPreserved",noMutation);cases.add(row);
  }
  Map<String,Object> result=new LinkedHashMap<>();result.put("cases",cases);result.put("assertions",options.length*3);result.put("passed",passed);result.put("failed",options.length*3-passed);result.put("databaseWrites",0);System.out.println(JSON.toJSONString(result));
  if(passed!=options.length*3)System.exit(1);
 }
}
