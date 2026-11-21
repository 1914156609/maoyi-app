import java.lang.reflect.*;
import java.util.*;
import com.alibaba.fastjson2.JSON;
import com.ruoyi.common.core.domain.entity.SysDept;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.mapper.SysDeptMapper;
import com.ruoyi.system.service.impl.SysDeptServiceImpl;
import org.springframework.transaction.annotation.Transactional;
class BackendDeptLockReviewProbe {
 static final List<Map<String,Object>> checks=new ArrayList<>();static final List<String> calls=new ArrayList<>();static int children,users;
 static void check(String name,boolean passed){checks.add(Map.of("name",name,"passed",passed));}
 static SysDept dept(long id,long parent,String ancestors){SysDept d=new SysDept();d.setDeptId(id);d.setParentId(parent);d.setAncestors(ancestors);d.setStatus("0");d.setDelFlag("0");d.setDeptName("synthetic");d.setOrderNum(1);return d;}
 static SysDeptServiceImpl service()throws Exception{calls.clear();children=users=0;SysDeptServiceImpl service=new SysDeptServiceImpl();SysDeptMapper mapper=(SysDeptMapper)Proxy.newProxyInstance(SysDeptMapper.class.getClassLoader(),new Class[]{SysDeptMapper.class},(o,m,a)->{calls.add(m.getName());return switch(m.getName()){case "lockDeptTree"->List.of(10L,20L);case "selectDeptById"->((Long)a[0]).longValue()==10?dept(10,0,"0"):dept(20,1,"0,1");case "selectChildrenDeptById"->List.of();case "hasChildByDeptId"->children;case "checkDeptExistUser"->users;case "updateDept","insertDept","deleteDeptById","updateDeptChildren"->1;default->null;};});Field f=SysDeptServiceImpl.class.getDeclaredField("deptMapper");f.setAccessible(true);f.set(service,mapper);return service;}
 static boolean refused(Runnable action){try{action.run();return false;}catch(ServiceException expected){return true;}}
 public static void main(String[] args)throws Exception{
  SysDeptServiceImpl s=service();s.insertDept(dept(30,20,"injected"));check("insert acquires tree lock before parent read and insert",calls.get(0).equals("lockDeptTree")&&calls.indexOf("selectDeptById")<calls.indexOf("insertDept"));
  s=service();s.updateDept(dept(10,20,"injected"));check("reparent acquires tree lock before old and new chain reads",calls.get(0).equals("lockDeptTree")&&calls.indexOf("selectDeptById")<calls.indexOf("updateDept"));
  s=service();s.updateDeptSort(new String[]{"20","10"},new String[]{"1","2"});check("reverse-order sort takes same lock before row updates",calls.get(0).equals("lockDeptTree")&&Collections.frequency(calls,"updateDeptSort")==2);
  s=service();s.deleteDeptById(10L);check("delete takes same lock and rechecks child and user constraints before write",calls.get(0).equals("lockDeptTree")&&calls.indexOf("hasChildByDeptId")<calls.indexOf("deleteDeptById")&&calls.indexOf("checkDeptExistUser")<calls.indexOf("deleteDeptById"));
  s=service();children=1;final SysDeptServiceImpl childCase=s;check("concurrent child found inside delete transaction prevents delete",refused(()->childCase.deleteDeptById(10L))&&!calls.contains("deleteDeptById"));
  s=service();users=1;final SysDeptServiceImpl userCase=s;check("delete rechecks assigned users under lock",refused(()->userCase.deleteDeptById(10L))&&!calls.contains("deleteDeptById"));
  s=service();SysDept root=dept(10,0,"injected");s.updateDept(root);check("root edit stays valid and canonical under tree lock","0".equals(root.getAncestors()));
  for(String name:List.of("insertDept","updateDept","deleteDeptById","updateDeptSort")){Method method=Arrays.stream(SysDeptServiceImpl.class.getMethods()).filter(m->m.getName().equals(name)).findFirst().orElseThrow();Transactional tx=method.getAnnotation(Transactional.class);check(name+" has bounded transaction holding/releasing row locks",tx!=null&&tx.timeout()==15);}
  s=service();s.selectDeptById(10L);check("ordinary department reads do not acquire global tree lock",!calls.contains("lockDeptTree"));
  long passed=checks.stream().filter(x->Boolean.TRUE.equals(x.get("passed"))).count();System.out.println(JSON.toJSONString(Map.of("kind","actual department service with synthetic mapper; transaction annotation/order verification, no live SQL concurrency claim","assertions",checks.size(),"passed",passed,"failed",checks.size()-passed,"checks",checks)));if(passed!=checks.size())System.exit(1);
 }
}
