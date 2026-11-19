package com.loccoc.post_service.service;

import java.text.Normalizer;
import java.util.*;

/** Original-language lexical matching; scores are ranks, not semantic probabilities. */
public final class MomentTextMatcher {
  private MomentTextMatcher() {}

  static String normalize(String text) {
    if(text==null) return "";
    return Normalizer.normalize(text,Normalizer.Form.NFD).replaceAll("\\p{M}+","")
      .toLowerCase(Locale.ROOT).replace('đ','d').replaceAll("[^\\p{L}\\p{N}]+"," ").trim();
  }

  public static double score(String query,String text) {
    String q=normalize(query),value=normalize(text);
    if(q.isBlank()) return query.isBlank()?1:0;
    if(value.isBlank()) return 0;
    if(value.equals(q)) return 3;
    if((" "+value+" ").contains(" "+q+" ")) return 2;
    String[] terms=q.split(" "),words=value.split(" ");
    if(terms.length>words.length) return 0;
    double best=0;
    // Preserve term order and require all terms, allowing up to two intervening words.
    for(int start=0;start<words.length;start++) {
      int position=start,totalEdits=0,matched=0;
      for(String term:terms) {
        boolean found=false;
        while(position<words.length && position<start+terms.length+2) {
          String word=words[position++];
          int budget=term.length()<4?0:term.length()<8?1:2;
          int edits=distance(term,word,budget);
          if(edits<=budget) { totalEdits+=edits;matched++;found=true;break; }
        }
        if(!found) break;
      }
      if(matched==terms.length) best=Math.max(best,1.0/(1+totalEdits));
    }
    return best;
  }

  private static int distance(String a,String b,int max) {
    if(a.equals(b)) return 0;
    if(max==0 || Math.abs(a.length()-b.length())>max) return max+1;
    int[] previous=new int[b.length()+1],older=null;
    for(int j=0;j<previous.length;j++) previous[j]=j;
    for(int i=1;i<=a.length();i++) {
      int[] current=new int[b.length()+1];Arrays.fill(current,max+1);current[0]=i;
      int minimum=max+1;
      for(int j=Math.max(1,i-max);j<=Math.min(b.length(),i+max);j++) {
        int cost=a.charAt(i-1)==b.charAt(j-1)?0:1;
        current[j]=Math.min(previous[j]+1,Math.min(current[j-1]+1,previous[j-1]+cost));
        if(older!=null && i>1 && j>1 && a.charAt(i-1)==b.charAt(j-2) && a.charAt(i-2)==b.charAt(j-1))
          current[j]=Math.min(current[j],older[j-2]+1);
        minimum=Math.min(minimum,current[j]);
      }
      if(minimum>max) return max+1;
      older=previous;previous=current;
    }
    return previous[b.length()];
  }
}
