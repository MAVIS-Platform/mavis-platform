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
  var rules=RULE.matcher(code);while(rules.find()){if(!accessRule(code,rules.start()))continue;String args=rules.group(1);if(!LITERAL.matcher(args).replaceAll("").replaceAll("[\\s,{}]", "").isEmpty())continue;var literals=LITERAL.matcher(args);while(literals.find()&&result.size()<32)result.add(literals.group(1));}return result;
 }


 static String excerpt(String source,String role){
  String code=withoutComments(source);var rules=RULE.matcher(code);
  while(rules.find()){
   if(!accessRule(code,rules.start()))continue;String args=rules.group(1);if(!LITERAL.matcher(args).replaceAll("").replaceAll("[\\s,{}]", "").isEmpty())continue;
   var literal=LITERAL.matcher(args);while(literal.find())if(role.equals(literal.group(1))){int at=rules.start(1)+literal.start();return source.substring(Math.max(0,at-200),Math.min(source.length(),at+900));}
  }return "";
 }
 static boolean inLiteral(String source,int end){
  boolean string=false,character=false,escape=false;
  for(int i=0;i<end;i++){char c=source.charAt(i);if(escape){escape=false;continue;}if((string||character)&&c=='\\'){escape=true;continue;}if(c=='"'&&!character)string=!string;if(c=='\''&&!string)character=!character;}return string||character;
 }
 static boolean accessRule(String source,int at){
  if(!inLiteral(source,at))return source.charAt(at)=='@'||(at>0&&source.charAt(at-1)=='.');
  int annotation=source.lastIndexOf("@PreAuthorize",at);if(annotation<0||inLiteral(source,annotation))return false;
  int open=annotation+"@PreAuthorize".length();while(open<source.length()&&Character.isWhitespace(source.charAt(open)))open++;
  if(open>=source.length()||source.charAt(open)!='(')return false;
  int depth=0;boolean string=false,character=false,escape=false;
  for(int i=open;i<source.length();i++){char c=source.charAt(i);if(escape){escape=false;continue;}if((string||character)&&c=='\\'){escape=true;continue;}if(c=='"'&&!character){string=!string;continue;}if(c=='\''&&!string){character=!character;continue;}if(!string&&!character){if(c=='(')depth++;if(c==')'&&--depth==0)return at>open&&at<i;}}return false;
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
