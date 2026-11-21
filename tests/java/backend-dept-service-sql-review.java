import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import com.alibaba.fastjson2.JSON;
import com.ruoyi.common.core.domain.entity.SysDept;
import com.ruoyi.system.mapper.SysDeptMapper;
import com.ruoyi.system.service.impl.SysDeptServiceImpl;
import org.mybatis.spring.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.support.*;
import org.springframework.transaction.support.TransactionTemplate;

class BackendDeptServiceSqlReview {
 static final List<Map<String,Object>> checks=new ArrayList<>();
 static final List<Long> ids=new ArrayList<>();static final List<Future<Map<String,Object>>> futures=new ArrayList<>();
 static final String marker="qa_dept_sql_"+UUID.randomUUID().toString().replace("-","").substring(0,6);
 static JdbcTemplate jdbc;static DriverManagerDataSource source;static SysDeptServiceImpl service;static String database;
 static final ExecutorService workers=Executors.newFixedThreadPool(2);
 static final List<Map<String,Object>> schedules=new ArrayList<>();
 static void check(String name,boolean passed){if(!passed)throw new AssertionError(name);checks.add(Map.of("name",name,"passed",true));}
 static SysDept dept(long id,long parent,String ancestors,String name,String status){SysDept d=new SysDept();d.setDeptId(id);d.setParentId(parent);d.setAncestors(ancestors);d.setDeptName(name);d.setStatus(status);d.setDelFlag("0");d.setOrderNum(1);d.setCreateBy(marker);return d;}
 static long seed(String name,long parent,String ancestors,String status){KeyHolder keys=new GeneratedKeyHolder();jdbc.update(connection->{PreparedStatement ps=connection.prepareStatement("INSERT INTO sys_dept(parent_id,ancestors,dept_name,order_num,status,del_flag,create_by,create_time) VALUES(?,?,?,1,?,'0',?,NOW())",Statement.RETURN_GENERATED_KEYS);ps.setLong(1,parent);ps.setString(2,ancestors);ps.setString(3,name);ps.setString(4,status);ps.setString(5,marker);return ps;},keys);long id=keys.getKey().longValue();ids.add(id);return id;}
 static TransactionTemplate transaction(){TransactionTemplate tx=new TransactionTemplate(new DataSourceTransactionManager(source));tx.setTimeout(15);return tx;}
 static Map<String,Object> mutation(String label,Supplier<Integer> work){try{Integer changed=transaction().execute(status->work.get());return Map.of("label",label,"success",changed!=null&&changed>0);}catch(RuntimeException e){return Map.of("label",label,"success",false,"errorType",e.getClass().getSimpleName(),"message",Objects.toString(e.getMessage(),""));}}
 static int blocked()throws Exception{Process p=new ProcessBuilder("mysql","--protocol=socket","-uroot","-N",database).start();try(OutputStream in=p.getOutputStream()){in.write("SELECT COUNT(*) FROM information_schema.innodb_trx WHERE trx_state='LOCK WAIT' AND trx_query LIKE '%sys_dept%';\n".getBytes(StandardCharsets.UTF_8));}String out=new String(p.getInputStream().readAllBytes(),StandardCharsets.UTF_8).trim();String error=new String(p.getErrorStream().readAllBytes(),StandardCharsets.UTF_8);if(p.waitFor()!=0)throw new IllegalStateException(error);return Integer.parseInt(out);}
 static List<Map<String,Object>> pair(String label,List<Long> gateIds,Supplier<Integer> first,Supplier<Integer> second)throws Exception{
  List<Future<Map<String,Object>>> launched=new ArrayList<>();int waiting=0;
  try(Connection gate=source.getConnection()){
   gate.setAutoCommit(false);try(Statement lock=gate.createStatement();ResultSet rows=lock.executeQuery("SELECT dept_id FROM sys_dept WHERE dept_id IN ("+String.join(",",gateIds.stream().map(String::valueOf).toList())+") ORDER BY dept_id FOR UPDATE")){while(rows.next()){} }
   CountDownLatch started=new CountDownLatch(2);
   for(var work:List.of(first,second)){int index=launched.size();Future<Map<String,Object>> future=workers.submit(()->{started.countDown();try{if(!started.await(5,TimeUnit.SECONDS))throw new IllegalStateException("both service writers did not start");}catch(InterruptedException e){throw new IllegalStateException(e);}return mutation(label+"-"+index,work);});launched.add(future);futures.add(future);}
   try{long until=System.currentTimeMillis()+10000;while(System.currentTimeMillis()<until){waiting=blocked();if(waiting>=2)break;Thread.sleep(75);}}
   finally{gate.commit();}
  }
  List<Map<String,Object>> outcomes=new ArrayList<>();for(var future:launched)outcomes.add(future.get(25,TimeUnit.SECONDS));schedules.add(Map.of("phase",label,"blockedWriters",waiting,"outcomes",outcomes));check(label+": both actual service transactions reached the SQL gate",waiting>=2);return outcomes;
 }
 static boolean exactlyOne(List<Map<String,Object>> outcomes){return outcomes.stream().filter(o->Boolean.TRUE.equals(o.get("success"))).count()==1;}
 static String hierarchy(List<Long> selected){return JSON.toJSONString(jdbc.queryForList("SELECT dept_id,parent_id,ancestors,status,del_flag FROM sys_dept WHERE dept_id IN ("+String.join(",",selected.stream().map(String::valueOf).toList())+") ORDER BY dept_id"));}
 public static void main(String[] args)throws Exception{
  Map<String,Object> failure=null;String initial=null,after=null;int remaining=-1;
  try{
   var env=JSON.parseObject(Files.readString(Path.of(".secrets/java-local.json"))).getJSONObject("env");String url=env.getString("DB_URL");if(!url.startsWith("jdbc:mysql://127.0.0.1:")&&!url.startsWith("jdbc:mysql://localhost:"))throw new IllegalStateException("Local datasource required");
   database=url.substring(url.indexOf('/',"jdbc:mysql://".length())+1).split("\\?")[0];if(!database.matches("maoyi_ruoyi|maoyi_qa_clone_[a-f0-9]{6}"))throw new IllegalStateException("Unexpected QA database");
   source=new DriverManagerDataSource(url,env.getString("DB_USER"),env.getString("DB_PASSWORD"));jdbc=new JdbcTemplate(source);
   var xml=new ClassPathResource("mapper/system/SysDeptMapper.xml");String xmlText=new String(xml.getInputStream().readAllBytes(),StandardCharsets.UTF_8);check("candidate mapper contains ordered transaction tree lock",xmlText.contains("select dept_id from sys_dept order by dept_id for update"));
   SqlSessionFactoryBean factory=new SqlSessionFactoryBean();factory.setDataSource(source);factory.setTypeAliasesPackage("com.ruoyi.common.core.domain.entity");factory.setMapperLocations(xml);var session=new SqlSessionTemplate(factory.getObject());SysDeptMapper mapper=session.getMapper(SysDeptMapper.class);service=new SysDeptServiceImpl();Field field=SysDeptServiceImpl.class.getDeclaredField("deptMapper");field.setAccessible(true);field.set(service,mapper);
   String ancestors=jdbc.queryForObject("SELECT ancestors FROM sys_dept WHERE dept_id=103",String.class)+",103";
   long a=seed(marker+"A",103,ancestors,"1"),b=seed(marker+"B",103,ancestors,"1");initial=hierarchy(List.of(a,b));
   var swapped=pair("opposing-reparent",List.of(a,b),()->service.updateDept(dept(a,b,"",marker+"A","1")),()->service.updateDept(dept(b,a,"",marker+"B","1")));
   check("opposing reparent: exactly one transaction commits",exactlyOne(swapped));
   var states=jdbc.queryForList("SELECT dept_id,parent_id,ancestors FROM sys_dept WHERE dept_id IN (?,?) ORDER BY dept_id",a,b);long pa=((Number)states.get(0).get("parent_id")).longValue(),pb=((Number)states.get(1).get("parent_id")).longValue();check("opposing reparent: actual MySQL hierarchy has no two-node cycle",!(pa==b&&pb==a));
   long root=pa==103?a:b,leaf=root==a?b:a;String rootName=root==a?marker+"A":marker+"B";
   check("opposing reparent: fresh ancestors match surviving parent chain",ancestors.equals(jdbc.queryForObject("SELECT ancestors FROM sys_dept WHERE dept_id=?",String.class,root))&&(ancestors+","+root).equals(jdbc.queryForObject("SELECT ancestors FROM sys_dept WHERE dept_id=?",String.class,leaf)));
   long p=seed(marker+"P",103,ancestors,"0");String childName=marker+"C";SysDept child=dept(0,p,"",childName,"0");child.setDeptId(null);
   var insertDelete=pair("insert-delete",List.of(p),()->service.insertDept(child),()->service.deleteDeptById(p));
   var created=jdbc.queryForList("SELECT dept_id FROM sys_dept WHERE parent_id=? AND dept_name=? AND create_by=?",Long.class,p,childName,marker);ids.addAll(created);
   check("insert/delete: exactly one transaction commits",exactlyOne(insertDelete));String flag=jdbc.queryForObject("SELECT del_flag FROM sys_dept WHERE dept_id=?",String.class,p);int childCount=jdbc.queryForObject("SELECT COUNT(*) FROM sys_dept WHERE parent_id=? AND del_flag='0'",Integer.class,p);check("insert/delete: no active child has a deleted parent",("0".equals(flag)&&childCount==1)||("2".equals(flag)&&childCount==0));
   String beforeRollback=hierarchy(List.of(a,b));var rejected=mutation("forced-invalid-status",()->service.updateDept(dept(root,104,"",rootName,"xx")));check("SQL failure rolls back all descendant and parent changes",Boolean.FALSE.equals(rejected.get("success"))&&beforeRollback.equals(hierarchy(List.of(a,b))));
   var following=mutation("normal-following-update",()->service.updateDept(dept(root,103,"",rootName,"1")));check("row locks released after commit and rollback for next mutation",Boolean.TRUE.equals(following.get("success")));
   long ownRoot=seed(marker+"R",0,"0","1");var editedRoot=mutation("own-root-edit",()->service.updateDept(dept(ownRoot,0,"injected",marker+"R","1")));check("existing root parent0 edit preserves canonical ancestry",Boolean.TRUE.equals(editedRoot.get("success"))&&"0".equals(jdbc.queryForObject("SELECT ancestors FROM sys_dept WHERE dept_id=?",String.class,ownRoot)));
   var deletedRoot=mutation("own-empty-root-delete",()->service.deleteDeptById(ownRoot));check("empty newly seeded root can still be deleted",Boolean.TRUE.equals(deletedRoot.get("success"))&&"2".equals(jdbc.queryForObject("SELECT del_flag FROM sys_dept WHERE dept_id=?",String.class,ownRoot)));
   after=hierarchy(ids);
  }catch(Throwable e){failure=Map.of("type",e.getClass().getSimpleName(),"message",Objects.toString(e.getMessage(),""));}
  finally{
   for(var future:futures)try{future.get(25,TimeUnit.SECONDS);}catch(Exception ignored){}workers.shutdownNow();
   if(jdbc!=null){var created=jdbc.queryForList("SELECT dept_id FROM sys_dept WHERE create_by=?",Long.class,marker);for(long id:created)if(!ids.contains(id))ids.add(id);for(long id:ids)jdbc.update("DELETE FROM sys_dept WHERE dept_id=? AND create_by=?",id,marker);remaining=jdbc.queryForObject("SELECT COUNT(*) FROM sys_dept WHERE create_by=?",Integer.class,marker);if(remaining!=0&&failure==null)failure=Map.of("type","CleanupFailure","message","Tracked department fixture rows remain");}
   Map<String,Object> result=new LinkedHashMap<>();result.put("at",new java.util.Date().toInstant().toString());result.put("kind","actual newly built department service + MyBatis + Spring-managed transactions + real local MySQL controlled lock scheduling; no HTTP service restart, browser or deployment");result.put("candidate","post-R24 department concurrency source fix; complete Maven build");result.put("database",database);result.put("passed",failure==null);result.put("assertions",checks.size());result.put("checks",checks);result.put("schedules",schedules);result.put("before",initial);result.put("after",after);result.put("failure",failure);result.put("cleanup",Map.of("trackedDepartmentIds",ids,"remainingDepartments",remaining));Path out=Path.of(".data/qa/current-review/backend-dept-service-sql-review.json");Files.writeString(out,JSON.toJSONString(result));System.out.println(JSON.toJSONString(Map.of("file",out.toString(),"passed",failure==null,"assertions",checks.size(),"cleanup",result.get("cleanup"),"failure",failure==null?Map.of():failure)));if(failure!=null)System.exit(1);
  }
 }
}
