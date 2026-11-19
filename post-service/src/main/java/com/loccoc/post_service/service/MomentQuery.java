package com.loccoc.post_service.service;
import com.loccoc.post_service.dto.MomentSearch;
import com.loccoc.post_service.exception.*;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;
public final class MomentQuery {
  private MomentQuery() {}
  private static final String DATE="(\\d{1,2})/(\\d{1,2})/(\\d{4})";
  public static MomentSearch resolve(MomentSearch input,Instant now) {
    try { return parse(input,now); }
    catch(DateTimeException | NumberFormatException e) { throw new AppException(ErrorCode.INVALID_PARAMETER); }
  }
  private static MomentSearch parse(MomentSearch input,Instant now) {
    String q=Normalizer.normalize(input.query(),Normalizer.Form.NFC).trim();
    if(q.codePoints().anyMatch(c->c<32 || c==127) || (input.dateFrom()!=null && input.dateTo()!=null && input.dateFrom().isAfter(input.dateTo()))) throw new AppException(ErrorCode.INVALID_PARAMETER);
    if(input.dateFrom()!=null || input.dateTo()!=null) return input;
    var today=now.atOffset(ZoneOffset.ofHours(7)).toLocalDate();
    String lower=q.toLowerCase(Locale.forLanguageTag("vi")),phrase=null;
    LocalDate start=null,end=null;
    var month=Pattern.compile("tháng\\s+(\\d{1,2})\\s*(?:năm\\s+|/)([0-9]{4})").matcher(lower);
    var year=Pattern.compile("năm\\s+([0-9]{4})").matcher(lower);
    var range=Pattern.compile("từ\\s+(?:ngày\\s+)?"+DATE+"\\s+đến\\s+(?:ngày\\s+)?"+DATE).matcher(lower);
    var day=Pattern.compile("(?:ngày\\s+)?"+DATE).matcher(lower);
    if(range.find()) {
      start=LocalDate.of(Integer.parseInt(range.group(3)),Integer.parseInt(range.group(2)),Integer.parseInt(range.group(1)));
      var last=LocalDate.of(Integer.parseInt(range.group(6)),Integer.parseInt(range.group(5)),Integer.parseInt(range.group(4)));
      if(last.isBefore(start)) throw new AppException(ErrorCode.INVALID_PARAMETER);
      end=last.plusDays(1);phrase=range.group();
    } else if(day.find()) { start=LocalDate.of(Integer.parseInt(day.group(3)),Integer.parseInt(day.group(2)),Integer.parseInt(day.group(1)));end=start.plusDays(1);phrase=day.group(); }
    else if(month.find()) { start=LocalDate.of(Integer.parseInt(month.group(2)),Integer.parseInt(month.group(1)),1);end=start.plusMonths(1);phrase=month.group(); }
    else if(lower.contains("hôm qua") || lower.contains("hôm nay")) { phrase=lower.contains("hôm qua")?"hôm qua":"hôm nay";start=today.minusDays(phrase.equals("hôm qua")?1:0);end=start.plusDays(1); }
    else if(lower.contains("tuần trước") || lower.contains("tuần này")) { phrase=lower.contains("tuần trước")?"tuần trước":"tuần này";start=today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(phrase.equals("tuần trước")?1:0);end=start.plusWeeks(1); }
    else if(lower.contains("tháng trước") || lower.contains("tháng này")) { phrase=lower.contains("tháng trước")?"tháng trước":"tháng này";start=today.withDayOfMonth(1).minusMonths(phrase.equals("tháng trước")?1:0);end=start.plusMonths(1); }
    else if(lower.contains("năm ngoái") || lower.contains("năm nay")) { phrase=lower.contains("năm ngoái")?"năm ngoái":"năm nay";start=LocalDate.of(today.getYear()-(phrase.equals("năm ngoái")?1:0),1,1);end=start.plusYears(1); }
    else if(year.find()) { start=LocalDate.of(Integer.parseInt(year.group(1)),1,1);end=start.plusYears(1);phrase=year.group(); }
    if(start==null) return new MomentSearch(q,input.limit(),input.albumId(),input.place(),input.dateFrom(),input.dateTo(),input.requireSemantic());
    if(start.getYear()<1900 || start.getYear()>today.getYear()+1) throw new AppException(ErrorCode.INVALID_PARAMETER);
    var from=start.atStartOfDay().toInstant(ZoneOffset.ofHours(7));var to=end.atStartOfDay().toInstant(ZoneOffset.ofHours(7)).minusMillis(1);
    int at=lower.indexOf(phrase);q=(q.substring(0,at)+" "+q.substring(at+phrase.length())).replaceAll("\\s+"," ").trim();
    if(Pattern.compile("hôm (nay|qua)|tuần (trước|này)|tháng (trước|này)|năm (ngoái|nay)|ngày\\s+\\d|tháng\\s+\\d|năm\\s+\\d|"+DATE).matcher(q.toLowerCase(Locale.ROOT)).find()) throw new AppException(ErrorCode.INVALID_PARAMETER);
    return new MomentSearch(q,input.limit(),input.albumId(),input.place(),from,to,input.requireSemantic());
  }
}
