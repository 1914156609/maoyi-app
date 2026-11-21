import java.sql.*;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.TimeZone;
public class TimezoneProbe {
 public static void main(String[] args) throws Exception {
  TimeZone.setDefault(TimeZone.getTimeZone(args[2]));
  String password=new BufferedReader(new InputStreamReader(System.in)).readLine();
  try(Connection c=DriverManager.getConnection(args[0],args[1],password);Statement s=c.createStatement()){
   try(ResultSet r=s.executeQuery("SELECT update_time, UNIX_TIMESTAMP(update_time)*1000 FROM sys_user WHERE user_id=113")){
    if(!r.next())throw new Exception("QA user missing");
    Timestamp t=r.getTimestamp(1);long expected=r.getLong(2);
    System.out.println("{\"jvmZone\":\""+TimeZone.getDefault().getID()+"\",\"jdbcEpoch\":"+t.getTime()+",\"mysqlEpoch\":"+expected+",\"differenceMs\":"+(t.getTime()-expected)+",\"serializedTime\":\""+new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(t)+"\"}");
   }
  }
 }
}
