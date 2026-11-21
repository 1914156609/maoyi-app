import java.beans.*;
import java.io.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import org.apache.ibatis.scripting.defaults.DefaultParameterHandler;
import com.alibaba.fastjson2.JSON;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.*;
import org.apache.ibatis.reflection.*;
import org.apache.ibatis.session.Configuration;
class BackendMapperReviewProbe {
 static Object sample(Type type,int depth)throws Exception{
  if(type instanceof ParameterizedType p){if(p.getRawType()==List.class||p.getRawType()==Collection.class)return List.of(sample(p.getActualTypeArguments()[0],depth+1));return sample(p.getRawType(),depth);}
  if(!(type instanceof Class<?> c))return null;
  if(c==String.class)return "review";if(c==Long.class||c==long.class)return 123L;if(c==Integer.class||c==int.class)return 1;if(c==Boolean.class||c==boolean.class)return true;if(c==java.util.Date.class)return new Date(0);if(c==String[].class)return new String[]{"review"};if(c.isArray()){Object array=Array.newInstance(c.componentType(),1);Array.set(array,0,sample(c.componentType(),depth+1));return array;}
  if(Map.class.isAssignableFrom(c))return new LinkedHashMap<>(Map.of("dataScope","","beginTime","2026-01-01","endTime","2026-12-31"));
  if(c.isPrimitive()||depth>3)return null;
  Object bean=c.getDeclaredConstructor().newInstance();for(PropertyDescriptor p:Introspector.getBeanInfo(c,Object.class).getPropertyDescriptors()){if(p.getWriteMethod()==null)continue;Type pt=p.getWriteMethod().getGenericParameterTypes()[0];try{Object value=sample(pt,depth+1);if(value!=null)p.getWriteMethod().invoke(bean,value);}catch(Exception ignored){}}
  return bean;
 }
 public static void main(String[] args)throws Exception{
  Configuration config=new Configuration();for(String p:List.of("com.ruoyi.common.core.domain.entity","com.ruoyi.system.domain","com.ruoyi.quartz.domain","com.ruoyi.generator.domain"))config.getTypeAliasRegistry().registerAliases(p);
  List<Path> files;try(var stream=Files.walk(Path.of("../maoyi-backend"))){files=stream.filter(p->p.toString().contains("/src/main/resources/mapper/")&&p.toString().endsWith("Mapper.xml")).sorted().toList();}
  for(Path file:files)try(InputStream in=Files.newInputStream(file)){new XMLMapperBuilder(in,config,file.toString(),config.getSqlFragments()).parse();}
  var local=JSON.parseObject(Files.readString(Path.of(".secrets/java-local.json"))).getJSONObject("env");
  String url=local.getString("DB_URL");
  if(!url.startsWith("jdbc:mysql://127.0.0.1:")&&!url.startsWith("jdbc:mysql://localhost:"))throw new IllegalStateException("Read-only schema checks require local MySQL");
  Connection connection=DriverManager.getConnection(url,local.getString("DB_USER"),local.getString("DB_PASSWORD"));connection.setReadOnly(true);
  List<Map<String,Object>> mapperReports=new ArrayList<>();List<String> errors=new ArrayList<>();int fieldCount=0,statementCount=0,parameterCount=0,selectsExecuted=0;
  for(Path file:files){String xml=Files.readString(file);String namespace=xml.substring(xml.indexOf("namespace=\"")+11);namespace=namespace.substring(0,namespace.indexOf('"'));Class<?> mapper=Class.forName(namespace);List<Map<String,Object>> methods=new ArrayList<>();
   for(Method method:mapper.getMethods()){String id=namespace+"."+method.getName();Map<String,Object> entry=new LinkedHashMap<>();entry.put("method",method.getName());if(!config.hasStatement(id)){errors.add("Missing mapped method "+id);continue;}MappedStatement statement=config.getMappedStatement(id);entry.put("command",statement.getSqlCommandType().name());statementCount++;
    List<Map<String,Object>> fields=new ArrayList<>();for(ResultMap rm:statement.getResultMaps())for(ResultMapping mapping:rm.getResultMappings()){String prop=mapping.getProperty();boolean exists=Map.class.isAssignableFrom(rm.getType())||prop==null||MetaClass.forClass(rm.getType(),new DefaultReflectorFactory()).hasSetter(prop);if(!exists)errors.add("Missing result setter "+id+" -> "+rm.getType().getName()+"."+prop);fields.add(Map.of("type",rm.getType().getSimpleName(),"property",Objects.toString(prop,""),"column",Objects.toString(mapping.getColumn(),""),"writable",exists));fieldCount++;}entry.put("resultFields",fields);
    try{Type[] types=method.getGenericParameterTypes();Object[] values=new Object[types.length];for(int i=0;i<types.length;i++)values[i]=sample(types[i],0);Object named=new ParamNameResolver(config,method).getNamedParams(values);BoundSql bound=statement.getBoundSql(named);entry.put("sql",bound.getSql().replaceAll("\\s+"," ").trim());List<String> params=new ArrayList<>();for(ParameterMapping mapping:bound.getParameterMappings()){String prop=mapping.getProperty();params.add(prop);parameterCount++;if(!bound.hasAdditionalParameter(prop)&&named!=null&&!config.getTypeHandlerRegistry().hasTypeHandler(named.getClass())){try{config.newMetaObject(named).getValue(prop);}catch(Exception invalid){errors.add("Unresolved SQL binding "+id+" -> "+prop+": "+invalid.getMessage());}}}entry.put("parameterBindings",params);entry.put("dynamicSqlRendered",true);
     if(statement.getSqlCommandType()==SqlCommandType.SELECT&& !bound.getSql().toLowerCase(Locale.ROOT).contains("for update")){try(PreparedStatement ps=connection.prepareStatement(bound.getSql())){ps.setMaxRows(1);ps.setQueryTimeout(10);new DefaultParameterHandler(statement,named,bound).setParameters(ps);try(ResultSet rows=ps.executeQuery()){ResultSetMetaData md=rows.getMetaData();List<String> columns=new ArrayList<>();for(int c=1;c<=md.getColumnCount();c++)columns.add(md.getColumnLabel(c));entry.put("actualMysqlColumns",columns);entry.put("readonlyMysqlSelectVerified",true);selectsExecuted++;}}}}catch(Exception e){entry.put("dynamicSqlRendered",false);entry.put("error",e.getMessage());errors.add("Dynamic SQL failed "+id+": "+e.getMessage());}
    methods.add(entry);
   }
   mapperReports.add(Map.of("file",file.toString(),"namespace",namespace,"methods",methods));
  }
  var result=Map.ofEntries(Map.entry("kind","actual MyBatis parsing + compiled mapper interfaces + field/parameter resolution + live READ ONLY MySQL SELECT metadata; no SQL writes or UI claims"),Map.entry("mappers",files.size()),Map.entry("statements",statementCount),Map.entry("readOnlyMysqlSelects",selectsExecuted),Map.entry("resultFieldOccurrences",fieldCount),Map.entry("parameterBindings",parameterCount),Map.entry("errors",errors),Map.entry("mapperReports",mapperReports));Path out=Path.of(args.length>0?args[0]:".data/qa/current-review/backend-mapper-contract.json");Files.writeString(out,JSON.toJSONString(result));System.out.println(JSON.toJSONString(Map.of("file",out.toString(),"mappers",files.size(),"statements",statementCount,"readOnlyMysqlSelects",selectsExecuted,"resultFieldOccurrences",fieldCount,"parameterBindings",parameterCount,"errors",errors)));if(!errors.isEmpty())System.exit(1);
 }
}
