import java.beans.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import com.alibaba.fastjson2.JSON;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.metadata.BeanDescriptor;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import com.ruoyi.common.annotation.Anonymous;
class BackendControllerReviewProbe {
 public static void main(String[] args)throws Exception{
  Validator validator=Validation.buildDefaultValidatorFactory().getValidator();List<Path> sources;
  try(var files=Files.walk(Path.of("../maoyi-backend"))){sources=files.filter(p->p.toString().contains("/src/main/java/")&&p.toString().endsWith("Controller.java")&&!p.toString().endsWith("BaseController.java")).sorted().toList();}
  List<Map<String,Object>> controllers=new ArrayList<>(),models=new ArrayList<>();Set<Class<?>> bodyTypes=new LinkedHashSet<>();List<String> errors=new ArrayList<>();int endpoints=0;
  for(Path file:sources){String name=file.toString().split("/src/main/java/")[1].replace('/','.').replaceAll("\\.java$","");Class<?> controller=Class.forName(name);RequestMapping root=AnnotatedElementUtils.findMergedAnnotation(controller,RequestMapping.class);String[] bases=root==null?new String[]{""}:root.path();if(bases.length==0)bases=new String[]{""};List<Map<String,Object>> methods=new ArrayList<>();
   for(Method m:controller.getDeclaredMethods()){RequestMapping mapping=AnnotatedElementUtils.findMergedAnnotation(m,RequestMapping.class);if(mapping==null)continue;PreAuthorize permission=AnnotatedElementUtils.findMergedAnnotation(m,PreAuthorize.class);boolean anonymous=AnnotatedElementUtils.hasAnnotation(m,Anonymous.class)||AnnotatedElementUtils.hasAnnotation(controller,Anonymous.class);List<String> paths=new ArrayList<>();String[] sub=mapping.path();if(sub.length==0)sub=new String[]{""};for(String base:bases)for(String path:sub)paths.add(base+path);List<Map<String,Object>> params=new ArrayList<>();
    for(Parameter p:m.getParameters()){PathVariable path=p.getAnnotation(PathVariable.class);RequestParam query=p.getAnnotation(RequestParam.class);RequestBody body=p.getAnnotation(RequestBody.class);if(body!=null)bodyTypes.add(p.getType());params.add(Map.of("name",p.getName(),"type",p.getParameterizedType().getTypeName(),"binding",path!=null?"path:"+(!path.value().isEmpty()?path.value():p.getName()):query!=null?"query:"+(!query.value().isEmpty()?query.value():p.getName()):body!=null?"json":"model/servlet","beanValidated",Arrays.stream(p.getAnnotations()).anyMatch(a->a.annotationType().getSimpleName().matches("Validated|Valid"))));}
    for(String path:paths){Matcher vars=Pattern.compile("\\{([^}:]+)(?::[^}]+)?}").matcher(path);while(vars.find()){String v=vars.group(1);boolean found=Arrays.stream(m.getParameters()).anyMatch(p->{PathVariable a=p.getAnnotation(PathVariable.class);return a!=null&&(a.value().isEmpty()?p.getName():a.value()).equals(v);});if(!found)errors.add(name+"."+m.getName()+": unbound path variable "+v);}}
    methods.add(Map.of("method",m.getName(),"paths",paths,"httpMethods",Arrays.stream(mapping.method()).map(Enum::name).toList(),"authorization",anonymous?"anonymous":permission!=null?permission.value():"authenticated; custom service checks may additionally apply","parameters",params));endpoints+=paths.size();
   }
   controllers.add(Map.of("file",file.toString(),"class",name,"methods",methods));
  }
  for(Class<?> type:bodyTypes){if(Map.class.isAssignableFrom(type)||type.isPrimitive()||type.getName().startsWith("java."))continue;List<Map<String,Object>> fields=new ArrayList<>();BeanDescriptor descriptor=validator.getConstraintsForClass(type);for(PropertyDescriptor p:Introspector.getBeanInfo(type,Object.class).getPropertyDescriptors()){if(p.getReadMethod()==null)continue;var constraints=descriptor.getConstraintsForProperty(p.getName());List<Map<String,Object>> rules=new ArrayList<>();if(constraints!=null)for(var rule:constraints.getConstraintDescriptors()){Map<String,Object> attrs=new LinkedHashMap<>(rule.getAttributes());attrs.remove("payload");attrs.remove("groups");rules.add(Map.of("annotation",rule.getAnnotation().annotationType().getSimpleName(),"attributes",attrs,"groups",rule.getGroups().stream().map(Class::getSimpleName).sorted().toList()));}fields.add(Map.of("property",p.getName(),"type",p.getPropertyType().getTypeName(),"writable",p.getWriteMethod()!=null,"validation",rules));}models.add(Map.of("class",type.getName(),"fields",fields));}
  Path out=Path.of(".data/qa/current-review/backend-controller-contract.json");Files.writeString(out,JSON.toJSONString(Map.of("kind","compiled Spring controller mapping/authorization/binding and BeanValidation property inventory; no endpoint execution claim","controllers",controllers,"bodyModels",models,"errors",errors)));System.out.println(JSON.toJSONString(Map.of("file",out.toString(),"controllers",controllers.size(),"endpointPaths",endpoints,"beanBodyModels",models.size(),"errors",errors)));if(!errors.isEmpty())System.exit(1);
 }
}
