import java.lang.reflect.*;
import java.util.*;
import com.alibaba.fastjson2.JSON;
import com.ruoyi.common.core.domain.entity.SysDept;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.mapper.SysDeptMapper;
import com.ruoyi.system.service.impl.SysDeptServiceImpl;
import org.springframework.transaction.annotation.Transactional;
class BackendDepartmentReviewProbe {
 static List<Map<String,Object>> checks=new ArrayList<>();static int writes;static SysDept parent,old;static List<SysDept> children;static void check(String n,boolean p){checks.add(Map.of("name",n,"passed",p));}
 static SysDept dept(long id,long parent,String ancestors){SysDept d=new SysDept();d.setDeptId(id);d.setParentId(parent);d.setAncestors(ancestors);d.setStatus("0");d.setDelFlag("0");return d;}
 static SysDeptServiceImpl service()throws Exception{writes=0;SysDeptServiceImpl service=new SysDeptServiceImpl();SysDeptMapper mapper=(SysDeptMapper)Proxy.newProxyInstance(SysDeptMapper.class.getClassLoader(),new Class[]{SysDeptMapper.class},(o,m,a)->switch(m.getName()){case "selectDeptById"->((Long)a[0]).longValue()==10?old:parent;case "selectChildrenDeptById"->children;case "updateDeptChildren","updateDept","insertDept","updateDeptStatusNormal"->{writes++;yield 1;}default->null;});Field f=SysDeptServiceImpl.class.getDeclaredField("deptMapper");f.setAccessible(true);f.set(service,mapper);return service;}
 public static void main(String[] args)throws Exception{
  for(String mode:List.of("self","descendant","missingParent","deletedParent","missingCurrent")){
   old=dept(10,1,"0,1");parent=dept(11,10,"0,1,10");children=new ArrayList<>();SysDept input=dept(10,11,"injected");
   switch(mode){case "self"->input.setParentId(10L);case "missingParent"->parent=null;case "deletedParent"->parent.setDelFlag("2");case "missingCurrent"->old=null;}
   SysDeptServiceImpl s=service();boolean rejected=false;try{s.updateDept(input);}catch(ServiceException expected){rejected=true;}check(mode+" rejected before any hierarchy write",rejected&&writes==0);
  }
  old=dept(10,1,"0,1");parent=dept(20,2,"0,2");children=new ArrayList<>(List.of(dept(12,10,"0,1,10")));SysDeptServiceImpl s=service();SysDept move=dept(10,20,"injected");check("valid move updates root and descendant canonical ancestors",s.updateDept(move)==1&&"0,2,20".equals(move.getAncestors())&&"0,2,20,10".equals(children.get(0).getAncestors()));
  old=dept(10,0,"0");parent=null;children=new ArrayList<>();s=service();SysDept root=dept(10,0,"injected");check("editing existing root keeps canonical root ancestry",s.updateDept(root)==1&&"0".equals(root.getAncestors()));
  old=null;parent=null;children=new ArrayList<>();s=service();boolean rejected=false;try{s.insertDept(dept(22,999,""));}catch(ServiceException expected){rejected=true;}catch(Exception unexpected){}check("insert missing parent returns business error before write",rejected&&writes==0);
  check("multi-step hierarchy update declares database transaction",SysDeptServiceImpl.class.getMethod("updateDept",SysDept.class).isAnnotationPresent(Transactional.class));
  long passed=checks.stream().filter(x->Boolean.TRUE.equals(x.get("passed"))).count();System.out.println(JSON.toJSONString(Map.of("kind","actual department service with synthetic mapper boundaries; no database mutation or UI", "assertions",checks.size(),"passed",passed,"failed",checks.size()-passed,"checks",checks)));if(passed!=checks.size())System.exit(1);
 }
}
