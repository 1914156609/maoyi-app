import java.lang.reflect.*;
import java.sql.PreparedStatement;
import java.sql.ParameterMetaData;
import java.sql.Types;
import java.util.*;
import com.alibaba.fastjson2.JSON;
import com.github.pagehelper.Page;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.page.PageAutoDialect;
import com.ruoyi.framework.config.MyBatisConfig;
import com.ruoyi.framework.config.properties.PageHelperProperties;
import com.ruoyi.framework.mybatis.MyBatis36MySqlDialect;
import org.apache.ibatis.annotations.SelectProvider;
import org.apache.ibatis.builder.StaticSqlSource;
import org.apache.ibatis.builder.annotation.ProviderSqlSource;
import org.apache.ibatis.cache.CacheKey;
import org.apache.ibatis.mapping.*;
import org.apache.ibatis.scripting.defaults.DefaultParameterHandler;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.RowBounds;

class PageHelperCompatibilityProbe {
    static final List<Map<String, Object>> checks = new ArrayList<>();
    static final String FIRST = "First_PageHelper";
    static final String SECOND = "Second_PageHelper";

    public static class Filter {
        private final String name;
        public Filter(String name) { this.name = name; }
        public String getName() { return name; }
        public Map<String, Object> getParams() { return Map.of("active", true); }
    }

    public interface ProviderMapper {
        @SelectProvider(type = SqlProvider.class, method = "find")
        List<String> find(Filter filter);

        @SelectProvider(type = SqlProvider.class, method = "findTwo")
        List<String> findTwo(Filter filter, String status);
    }

    public static class SqlProvider {
        public static String find(Filter filter) {
            return "SELECT name FROM records WHERE name = #{name} ORDER BY name";
        }
        public static String findTwo(Filter filter, String status) {
            return "SELECT name FROM records WHERE name = #{filter.name} AND status = #{status} ORDER BY name";
        }
    }

    record Scenario(Configuration configuration, MappedStatement statement, BoundSql boundSql, Object original) {}

    static void check(String name, boolean passed) {
        checks.add(Map.of("name", name, "passed", passed));
    }

    static Scenario staticQuery(Object value, String property, Class<?> type) {
        Configuration configuration = new Configuration();
        List<ParameterMapping> mappings = property == null ? new ArrayList<>() :
            new ArrayList<>(List.of(new ParameterMapping.Builder(configuration, property, type).build()));
        String sql = "SELECT name FROM records" + (property == null ? "" : " WHERE name = ?") + " ORDER BY name";
        StaticSqlSource source = new StaticSqlSource(configuration, sql, mappings);
        MappedStatement statement = new MappedStatement.Builder(configuration, "qa.static", source, SqlCommandType.SELECT).build();
        return new Scenario(configuration, statement, source.getBoundSql(value), value);
    }

    static Scenario providerQuery(String method, Object value) throws Exception {
        Configuration configuration = new Configuration();
        Method mapperMethod = Arrays.stream(ProviderMapper.class.getMethods())
            .filter(m -> m.getName().equals(method)).findFirst().orElseThrow();
        ProviderSqlSource source = new ProviderSqlSource(configuration, mapperMethod.getAnnotation(SelectProvider.class),
            ProviderMapper.class, mapperMethod);
        MappedStatement statement = new MappedStatement.Builder(configuration, "qa." + method, source, SqlCommandType.SELECT).build();
        return new Scenario(configuration, statement, source.getBoundSql(value), value);
    }

    static MyBatis36MySqlDialect dialect() {
        MyBatis36MySqlDialect dialect = new MyBatis36MySqlDialect();
        dialect.setProperties(new Properties());
        return dialect;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> process(Scenario scenario) {
        PageHelper.startPage(2, 3, true);
        return (Map<String, Object>) dialect().processParameterObject(scenario.statement(), scenario.original(),
            scenario.boundSql(), new CacheKey());
    }

    static List<Object> bind(Scenario scenario, Map<String, Object> parameters) throws Exception {
        SortedMap<Integer, Object> values = new TreeMap<>();
        ParameterMetaData metadata = (ParameterMetaData) Proxy.newProxyInstance(ParameterMetaData.class.getClassLoader(),
            new Class<?>[] { ParameterMetaData.class }, (proxy, method, args) -> {
                if (method.getName().equals("getParameterCount")) return scenario.boundSql().getParameterMappings().size();
                if (method.getName().equals("getParameterType")) {
                    Class<?> type = scenario.boundSql().getParameterMappings().get((Integer) args[0] - 1).getJavaType();
                    return type == long.class || type == Long.class ? Types.BIGINT :
                        type == int.class || type == Integer.class ? Types.INTEGER : Types.VARCHAR;
                }
                return null;
            });
        PreparedStatement statement = (PreparedStatement) Proxy.newProxyInstance(PreparedStatement.class.getClassLoader(),
            new Class<?>[] { PreparedStatement.class }, (proxy, method, args) -> {
                if (method.getName().equals("getParameterMetaData")) return metadata;
                if (method.getName().startsWith("set") && args != null && args.length >= 2 && args[0] instanceof Integer index) {
                    values.put(index, method.getName().equals("setNull") ? null : args[1]);
                }
                return null;
            });
        new DefaultParameterHandler(scenario.statement(), parameters, scenario.boundSql()).setParameters(statement);
        return new ArrayList<>(values.values());
    }

    static void offsets(String name, Map<String, Object> values) {
        check(name + " preserves offset and page size", ((Number) values.get(FIRST)).longValue() == 3 &&
            ((Number) values.get(SECOND)).intValue() == 3);
    }

    public static void main(String[] args) throws Exception {
        try {
            PageHelperProperties settings = new PageHelperProperties("mysql", true, "count=countSql");
            check("existing PageHelper configuration keeps all three values", settings.toProperties().equals(Map.of(
                "helperDialect", "mysql", "supportMethodsArguments", "true", "params", "count=countSql")));
            new MyBatisConfig().pageInterceptor(settings);
            check("production MyBatis configuration selects the official custom dialect alias",
                PageAutoDialect.instanceDialect("mysql", settings.toProperties()) instanceof MyBatis36MySqlDialect);
            Scenario none = staticQuery(null, null, Object.class);
            Map<String, Object> empty = process(none);
            offsets("null input", empty);
            check("null input only gains the two pagination parameters", empty.size() == 2);

            Map<String, Object> original = Map.of("name", "地图筛选", FIRST, 999L);
            Scenario map = staticQuery(original, "name", String.class);
            Map<String, Object> mapped = process(map);
            offsets("immutable map", mapped);
            check("immutable map is copied without mutation", mapped != original && original.size() == 2 &&
                original.get(FIRST).equals(999L) && mapped.get("name").equals("地图筛选"));
            check("map filters and limit parameters remain bindable", bind(map, mapped).equals(List.of("地图筛选", 3L, 3)));

            Filter filter = new Filter("实体筛选");
            Scenario pojo = staticQuery(filter, "name", String.class);
            Map<String, Object> bean = process(pojo);
            offsets("POJO", bean);
            check("POJO getter and nested dynamic filter values survive", bean.get("name").equals("实体筛选") &&
                bean.get("params").equals(Map.of("active", true)));
            check("POJO stays unchanged", filter.getName().equals("实体筛选") && filter.getParams().size() == 1);
            check("POJO filters and limit parameters remain bindable", bind(pojo, bean).equals(List.of("实体筛选", 3L, 3)));

            Scenario scalar = staticQuery("标量筛选", "value", String.class);
            Map<String, Object> scalarValues = process(scalar);
            offsets("scalar", scalarValues);
            check("registered scalar type handler receives the original scalar", scalarValues.get("value").equals("标量筛选"));
            check("scalar SQL binding is preserved", bind(scalar, scalarValues).equals(List.of("标量筛选", 3L, 3)));

            Scenario provider = providerQuery("find", filter);
            Map<String, Object> providerValues = process(provider);
            offsets("single provider", providerValues);
            check("single ProviderSqlSource retains named and param1 aliases", providerValues.get("filter") == filter &&
                providerValues.get("param1") == filter);
            check("single provider keeps filter binding", bind(provider, providerValues).equals(List.of("实体筛选", 3L, 3)));

            Map<String, Object> pair = Map.of("filter", filter, "status", "active", "param1", filter, "param2", "active");
            Scenario providerTwo = providerQuery("findTwo", pair);
            Map<String, Object> pairValues = process(providerTwo);
            check("multiple provider parameters retain aliases and original identity", pairValues != pair && pair.size() == 4 &&
                pairValues.get("filter") == filter && pairValues.get("param1") == filter && pairValues.get("param2").equals("active"));
            check("multiple provider filter/status/limits remain bindable", bind(providerTwo, pairValues)
                .equals(List.of("实体筛选", "active", 3L, 3)));

            Scenario counting = staticQuery(filter, "name", String.class);
            Page<?> page = PageHelper.startPage(2, 3, true);
            MyBatis36MySqlDialect dialect = dialect();
            check("count remains enabled", dialect.beforeCount(counting.statement(), filter, RowBounds.DEFAULT));
            String countSql = dialect.getCountSql(counting.statement(), counting.boundSql(), filter, RowBounds.DEFAULT, new CacheKey());
            check("count SQL keeps the filter and removes unnecessary ordering", countSql.toLowerCase(Locale.ROOT).contains("count(") &&
                countSql.toLowerCase(Locale.ROOT).contains("where name = ?") && !countSql.toLowerCase(Locale.ROOT).contains("order by"));
            check("count result preserves pagination total", dialect.afterCount(8L, filter, RowBounds.DEFAULT) && page.getTotal() == 8);
            page.setOrderBy("name desc");
            String pageSql = dialect.getPageSql(counting.statement(), counting.boundSql(), filter, RowBounds.DEFAULT, new CacheKey());
            check("order and MySQL limit clauses survive", pageSql.toLowerCase(Locale.ROOT).contains("order by name desc") &&
                pageSql.toLowerCase(Locale.ROOT).matches("(?s).*limit\\s*\\?,\\s*\\?.*"));

            PageHelper.clearPage();
            PageHelper.orderBy("name desc");
            Scenario orderOnly = staticQuery(filter, "name", String.class);
            int originalMappings = orderOnly.boundSql().getParameterMappings().size();
            Object orderValues = dialect.processParameterObject(orderOnly.statement(), filter, orderOnly.boundSql(), new CacheKey());
            check("order-only query preserves parameter identity and mappings", orderValues == filter &&
                orderOnly.boundSql().getParameterMappings().size() == originalMappings);
            check("order-only query skips count", !dialect.beforeCount(orderOnly.statement(), filter, RowBounds.DEFAULT));
        } finally {
            PageHelper.clearPage();
        }
        long passed = checks.stream().filter(check -> Boolean.TRUE.equals(check.get("passed"))).count();
        System.out.println(JSON.toJSONString(Map.of("kind", "actual MyBatis 3.6/PageHelper 6.1.1 dialect, SQL generation and JDBC binding; synthetic data, no DB or HTTP",
            "assertions", checks.size(), "passed", passed, "failed", checks.size() - passed, "checks", checks)));
        if (passed != checks.size()) System.exit(1);
    }
}
