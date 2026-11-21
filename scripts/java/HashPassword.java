import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
public class HashPassword {
  public static void main(String[] args) throws Exception {
    String password=new String(System.in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
    System.out.print(new BCryptPasswordEncoder().encode(password));
  }
}
