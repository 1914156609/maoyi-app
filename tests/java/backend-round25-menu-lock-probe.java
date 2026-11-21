import java.lang.reflect.*;
import java.util.*;
import com.alibaba.fastjson2.JSON;
import com.ruoyi.common.core.domain.entity.SysMenu;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.mapper.SysMenuMapper;
import com.ruoyi.system.mapper.SysRoleMenuMapper;
import com.ruoyi.system.service.impl.SysMenuServiceImpl;
import org.springframework.transaction.annotation.Transactional;

class BackendRound25MenuLockProbe {
    static final List<Map<String,Object>> checks=new ArrayList<>();
    static final List<String> calls=new ArrayList<>();
    static int children, roles;
    static SysMenu menu(Long id,long parent) {
        SysMenu m=new SysMenu();m.setMenuId(id);m.setParentId(parent);m.setMenuName("synthetic");m.setMenuType("F");m.setOrderNum(1);return m;
    }
    static SysMenuServiceImpl service()throws Exception {
        calls.clear();children=roles=0;
        SysMenuMapper mapper=(SysMenuMapper)Proxy.newProxyInstance(SysMenuMapper.class.getClassLoader(),new Class[]{SysMenuMapper.class},(o,m,a)->{
            calls.add(m.getName());return switch(m.getName()) {
                case "lockMenuTree"->List.of(10L,20L);
                case "selectMenuById"->(Long)a[0]==10L?menu(10L,0):(Long)a[0]==20L?menu(20L,0):null;
                case "selectMenuList"->List.of(menu(10L,0),menu(20L,0));
                case "checkMenuNameUnique"->null;
                case "selectMenusByPathOrRouteName"->List.of();
                case "hasChildByMenuId"->children;
                case "insertMenu","updateMenu","deleteMenuById"->1;
                default->null;
            };
        });
        SysRoleMenuMapper roleMapper=(SysRoleMenuMapper)Proxy.newProxyInstance(SysRoleMenuMapper.class.getClassLoader(),new Class[]{SysRoleMenuMapper.class},(o,m,a)->roles);
        SysMenuServiceImpl s=new SysMenuServiceImpl();
        for(var pair:Map.of("menuMapper",mapper,"roleMenuMapper",roleMapper).entrySet()){Field f=SysMenuServiceImpl.class.getDeclaredField(pair.getKey());f.setAccessible(true);f.set(s,pair.getValue());}
        return s;
    }
    static void check(String name,boolean ok){checks.add(Map.of("name",name,"passed",ok));}
    static boolean rejects(Runnable work){try{work.run();return false;}catch(ServiceException e){return true;}}
    public static void main(String[] args)throws Exception {
        SysMenuServiceImpl s=service();s.insertMenu(menu(null,20));check("insert locks tree before parent validation and persistence",calls.get(0).equals("lockMenuTree")&&calls.indexOf("selectMenuById")<calls.indexOf("insertMenu"));
        s=service();s.updateMenu(menu(10L,20));check("reparent locks tree before rereading current parent chain",calls.get(0).equals("lockMenuTree")&&calls.indexOf("selectMenuList")<calls.indexOf("updateMenu"));
        final SysMenuServiceImpl missing=service();check("missing parent rejected under lock",rejects(()->missing.insertMenu(menu(null,999)))&&!calls.contains("insertMenu"));
        final SysMenuServiceImpl self=service();check("self parent rejected under lock",rejects(()->self.updateMenu(menu(10L,10)))&&!calls.contains("updateMenu"));
        s=service();s.deleteMenuById(10L);check("delete locks and rechecks children and role assignment",calls.get(0).equals("lockMenuTree")&&calls.indexOf("hasChildByMenuId")<calls.indexOf("deleteMenuById"));
        final SysMenuServiceImpl child=service();children=1;check("child appearing before locked delete prevents deletion",rejects(()->child.deleteMenuById(10L))&&!calls.contains("deleteMenuById"));
        final SysMenuServiceImpl role=service();roles=1;check("assigned menu cannot be deleted inside transaction",rejects(()->role.deleteMenuById(10L))&&!calls.contains("deleteMenuById"));
        s=service();s.updateMenuSort(new String[]{"20","10"},new String[]{"1","2"});check("reverse order sort uses the same first lock",calls.get(0).equals("lockMenuTree"));
        for(String name:List.of("insertMenu","updateMenu","deleteMenuById","updateMenuSort")) {
            Method method=Arrays.stream(SysMenuServiceImpl.class.getMethods()).filter(m->m.getName().equals(name)).findFirst().orElseThrow();
            Transactional tx=method.getAnnotation(Transactional.class);check(name+" releases locks through a bounded transaction",tx!=null&&tx.timeout()==15);
        }
        long passed=checks.stream().filter(c->Boolean.TRUE.equals(c.get("passed"))).count();
        System.out.println(JSON.toJSONString(Map.of("kind","actual candidate menu service; synthetic mapper and transaction annotation/order checks; not HTTP/UI","assertions",checks.size(),"passed",passed,"failed",checks.size()-passed,"checks",checks)));
        if(passed!=checks.size())System.exit(1);
    }
}
