package com.mavis.analyzer.model.service;
import java.util.*;
import java.util.regex.Pattern;
/** Conservative literal access rules only; these identify principals, not human actors. */
final class SecurityRoleSource {
 private static final Pattern RULE=Pattern.compile("(?:hasRole|hasAnyRole|@RolesAllowed|@Secured)\\s*\\(([^)]*)\\)");
 private static final Pattern LITERAL=Pattern.compile("[\"']([A-Za-z][A-Za-z0-9_:-]{0,63})[\"']");
 static Set<String> roles(String code){
  var result=new LinkedHashSet<String>();
  if(!code.contains("@PreAuthorize")&&!code.contains(".hasRole")&&!code.contains(".hasAnyRole")&&!code.contains("@RolesAllowed")&&!code.contains("@Secured"))return result;
  var rules=RULE.matcher(code);while(rules.find()){String args=rules.group(1);if(!LITERAL.matcher(args).replaceAll("").replaceAll("[\\s,{}]", "").isEmpty())continue;var literals=LITERAL.matcher(args);while(literals.find()&&result.size()<32)result.add(literals.group(1));}return result;
 }
 static String withoutComments(String source){
  var out=new StringBuilder();boolean line=false,block=false,string=false,character=false,escape=false;
  for(int i=0;i<source.length();i++){char c=source.charAt(i),n=i+1<source.length()?source.charAt(i+1):0;
   if(line){if(c=='\n'){line=false;out.append(c);}else out.append(' ');continue;}
   if(block){if(c=='*'&&n=='/'){block=false;i++;out.append("  ");}else out.append(c=='\n'?'\n':' ');continue;}
   if(!string&&!character&&c=='/'&&(n=='/'||n=='*')){line=n=='/';block=n=='*';i++;out.append("  ");continue;}
   out.append(c);if(escape){escape=false;continue;}if((string||character)&&c=='\\'){escape=true;continue;}
   if(c=='"'&&!character)string=!string;if(c=='\''&&!string)character=!character;
  }return out.toString();
 }
}
