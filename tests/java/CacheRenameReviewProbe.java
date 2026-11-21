import java.lang.reflect.*;
import java.util.*;
import com.alibaba.fastjson2.JSON;
import com.ruoyi.common.constant.CacheConstants;
import com.ruoyi.common.core.domain.entity.SysDictData;
import com.ruoyi.common.core.domain.entity.SysDictType;
import com.ruoyi.common.core.redis.RedisCache;
import com.ruoyi.common.utils.DictUtils;
import com.ruoyi.common.utils.spring.SpringUtils;
import com.ruoyi.system.domain.SysConfig;
import com.ruoyi.system.mapper.*;
import com.ruoyi.system.service.impl.SysConfigServiceImpl;
import com.ruoyi.system.service.impl.SysDictTypeServiceImpl;
import org.springframework.context.support.GenericApplicationContext;

class CacheRenameReviewProbe {
    static final List<Map<String,Object>> checks = new ArrayList<>();
    static final String OLD = "qa_cache_probe_old", NEW = "qa_cache_probe_new", OTHER = "qa_cache_probe_other";

    static class MemoryCache extends RedisCache {
        final Map<String,Object> values = new HashMap<>();
        final List<String> deleted = new ArrayList<>(), written = new ArrayList<>();
        void seed(String key, Object value) { values.put(key, value instanceof List<?> ? JSON.parseArray(JSON.toJSONString(value)) : value); }
        @Override public <T> void setCacheObject(String key, T value) { seed(key, value); written.add(key); }
        @Override @SuppressWarnings("unchecked") public <T> T getCacheObject(String key) { return (T) values.get(key); }
        @Override public boolean deleteObject(String key) { deleted.add(key); return values.remove(key) != null; }
        @Override public boolean deleteObject(Collection keys) { throw new AssertionError("Global/multi-key cache deletion is forbidden"); }
        @Override public Collection<String> keys(String pattern) { throw new AssertionError("Wildcard cache scans are forbidden"); }
        void reset() { values.clear(); deleted.clear(); written.clear(); }
    }

    static void check(String name, boolean passed) { checks.add(Map.of("name", name, "passed", passed)); }
    static void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value);
    }
    @SuppressWarnings("unchecked") static <T> T mapper(Class<T> type, InvocationHandler handler) {
        return (T) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type}, handler);
    }
    static SysDictType type(String name) { SysDictType value = new SysDictType(); value.setDictId(901L); value.setDictType(name); value.setDictName("缓存合同"); return value; }
    static SysDictData data(long id, String type, String label, int sort, String status, String defaultFlag) {
        SysDictData value = new SysDictData(); value.setDictCode(id); value.setDictType(type); value.setDictLabel(label);
        value.setDictValue(label); value.setDictSort((long) sort); value.setStatus(status); value.setIsDefault(defaultFlag); return value;
    }
    static class DictionaryFixture {
        String storedType = OLD;
        int updatedRows = 1;
        boolean failUpdate;
        final List<SysDictData> rows = new ArrayList<>(List.of(data(1, OLD, "A", 2, "0", "N"),
            data(2, OLD, "B", 1, "0", "Y"), data(3, OLD, "C", 0, "1", "N")));
        final SysDictTypeServiceImpl service = new SysDictTypeServiceImpl();
        DictionaryFixture(MemoryCache cache) throws Exception {
            cache.reset(); cache.seed(DictUtils.getCacheKey(OLD), List.of(data(2, OLD, "B", 1, "0", "Y")));
            cache.seed(DictUtils.getCacheKey(OTHER), List.of(data(9, OTHER, "独立项", 1, "0", "N")));
            inject(service, "dictTypeMapper", mapper(SysDictTypeMapper.class, (proxy, method, args) -> switch (method.getName()) {
                case "selectDictTypeById" -> type(storedType);
                case "updateDictType" -> { if (failUpdate) throw new IllegalStateException("synthetic mapper failure"); if (updatedRows > 0) storedType = ((SysDictType) args[0]).getDictType(); yield updatedRows; }
                default -> throw new AssertionError("Unexpected type mapper call " + method.getName());
            }));
            inject(service, "dictDataMapper", mapper(SysDictDataMapper.class, (proxy, method, args) -> switch (method.getName()) {
                case "updateDictDataType" -> { int changed = 0; for (SysDictData row : rows) if (row.getDictType().equals(args[0])) { row.setDictType((String) args[1]); changed++; } yield changed; }
                case "selectDictDataByType" -> rows.stream().filter(row -> row.getDictType().equals(args[0]) && "0".equals(row.getStatus()))
                    .sorted(Comparator.comparing(SysDictData::getDictSort)).toList();
                default -> throw new AssertionError("Unexpected data mapper call " + method.getName());
            }));
        }
    }
    static SysConfig config(String key, String value) {
        SysConfig config = new SysConfig(); config.setConfigId(902L); config.setConfigKey(key); config.setConfigValue(value); return config;
    }
    public static void main(String[] args) throws Exception {
        MemoryCache cache = new MemoryCache();
        try (GenericApplicationContext context = new GenericApplicationContext()) {
            context.getBeanFactory().registerSingleton("redisCache", cache); context.refresh();
            SpringUtils spring = new SpringUtils(); spring.postProcessBeanFactory(context.getBeanFactory()); spring.setApplicationContext(context);
            DictionaryFixture fixture = new DictionaryFixture(cache);
            String unrelated = JSON.toJSONString(cache.values.get(DictUtils.getCacheKey(OTHER)));
            check("dictionary rename persists successfully", fixture.service.updateDictType(type(NEW)) == 1);
            check("rename removes exactly the previous dictionary key", cache.deleted.equals(List.of(DictUtils.getCacheKey(OLD))));
            check("rename cascades all data rows including inactive data", fixture.rows.stream().allMatch(row -> NEW.equals(row.getDictType())));
            check("new dictionary cache is rebuilt under only the new key", cache.written.equals(List.of(DictUtils.getCacheKey(NEW))));
            check("old dictionary lookup cannot return stale cached data", fixture.service.selectDictDataByType(OLD) == null);
            List<SysDictData> current = fixture.service.selectDictDataByType(NEW);
            check("new cache preserves active-only ordering", current != null && current.stream().map(SysDictData::getDictLabel).toList().equals(List.of("B", "A")));
            check("new cache preserves default flag and renamed field echo", current != null && "Y".equals(current.get(0).getIsDefault()) && current.stream().allMatch(row -> NEW.equals(row.getDictType())));
            check("unrelated dictionary cache is unchanged", unrelated.equals(JSON.toJSONString(cache.values.get(DictUtils.getCacheKey(OTHER)))));
            fixture.service.updateDictType(type(NEW + "_again"));
            check("a second rename removes its intermediate key", cache.deleted.equals(List.of(DictUtils.getCacheKey(OLD), DictUtils.getCacheKey(NEW))) && fixture.service.selectDictDataByType(NEW) == null);
            cache.deleted.clear(); cache.written.clear(); fixture.service.updateDictType(type(NEW + "_again"));
            check("same-type edit rebuilds current cache without deleting other keys", cache.deleted.isEmpty() && cache.written.equals(List.of(DictUtils.getCacheKey(NEW + "_again"))));

            fixture = new DictionaryFixture(cache); fixture.updatedRows = 0;
            fixture.service.updateDictType(type(NEW));
            check("zero-row update leaves cache untouched", cache.deleted.isEmpty() && cache.written.isEmpty() && cache.values.containsKey(DictUtils.getCacheKey(OLD)));
            fixture = new DictionaryFixture(cache); fixture.failUpdate = true;
            try { fixture.service.updateDictType(type(NEW)); check("mapper failure remains visible", false); }
            catch (IllegalStateException expected) { check("mapper failure remains visible", true); }
            check("failed update does not delete or rebuild cache", cache.deleted.isEmpty() && cache.written.isEmpty());

            cache.reset(); SysConfig[] stored = {config(OLD, "原值")};
            cache.seed(CacheConstants.SYS_CONFIG_KEY + OLD, "原值"); cache.seed(CacheConstants.SYS_CONFIG_KEY + OTHER, "独立配置");
            SysConfigServiceImpl configs = new SysConfigServiceImpl(); inject(configs, "redisCache", cache);
            inject(configs, "configMapper", mapper(SysConfigMapper.class, (proxy, method, parameters) -> switch (method.getName()) {
                case "selectConfigById" -> config(stored[0].getConfigKey(), stored[0].getConfigValue());
                case "updateConfig" -> { SysConfig value = (SysConfig) parameters[0]; stored[0] = config(value.getConfigKey(), value.getConfigValue()); yield 1; }
                case "selectConfig" -> stored[0].getConfigKey().equals(((SysConfig) parameters[0]).getConfigKey()) ? config(stored[0].getConfigKey(), stored[0].getConfigValue()) : null;
                default -> throw new AssertionError("Unexpected config mapper call " + method.getName());
            }));
            check("existing parameter-key rename succeeds", configs.updateConfig(config(NEW, "新值")) == 1);
            check("parameter rename already removes exactly its old key", cache.deleted.equals(List.of(CacheConstants.SYS_CONFIG_KEY + OLD)));
            check("old parameter lookup does not expose a stale value", configs.selectConfigByKey(OLD).isEmpty());
            check("new parameter value is cached and readable", "新值".equals(configs.selectConfigByKey(NEW)));
            check("unrelated parameter cache remains unchanged", "独立配置".equals(cache.values.get(CacheConstants.SYS_CONFIG_KEY + OTHER)));
            cache.deleted.clear(); configs.updateConfig(config(NEW, "再更新"));
            check("same-key parameter edit preserves its key and refreshes value", cache.deleted.isEmpty() && "再更新".equals(configs.selectConfigByKey(NEW)));
        }
        long passed = checks.stream().filter(check -> Boolean.TRUE.equals(check.get("passed"))).count();
        System.out.println(JSON.toJSONString(Map.of("kind", "actual dictionary/config services with in-memory mapper and Redis boundaries; no real HTTP/SQL/Redis or transaction-concurrency claim",
            "assertions", checks.size(), "passed", passed, "failed", checks.size() - passed, "checks", checks)));
        if (passed != checks.size()) System.exit(1);
    }
}
