package com.loccoc.post_service.service;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import javax.imageio.*;
import javax.imageio.stream.*;
import org.springframework.stereotype.Component;
import com.loccoc.post_service.exception.*;
@Component
public class MomentImages {
  public PhotoDecoder.Photo normalize(byte[] bytes,String mime) {
    if(bytes.length>10*1024*1024) throw new AppException(ErrorCode.REQUEST_TOO_LARGE);
    if(!java.util.Set.of("image/png","image/jpeg","image/webp").contains(mime)) throw new AppException(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
    try(var input=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
      var readers=ImageIO.getImageReaders(input);
      if(!readers.hasNext()) throw invalid();
      var reader=readers.next();
      try {
        reader.setInput(input);
        String format=reader.getFormatName().toLowerCase(java.util.Locale.ROOT);
        if(!(mime.equals("image/"+format) || (mime.equals("image/jpeg") && format.equals("jpg")))) throw invalid();
        int w=reader.getWidth(0),h=reader.getHeight(0);
        if(w<1 || h<1 || w>12000 || h>12000 || (long)w*h>40_000_000 || reader.getNumImages(true)!=1) throw invalid();
        var source=reader.read(0);
        double ratio=Math.min(1,1536.0/Math.max(w,h));
        var output=new BufferedImage(Math.max(1,(int)(w*ratio)),Math.max(1,(int)(h*ratio)),BufferedImage.TYPE_INT_RGB);
        var graphics=output.createGraphics();
        try { graphics.setColor(Color.WHITE);graphics.fillRect(0,0,output.getWidth(),output.getHeight());
          graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BICUBIC);
          graphics.drawImage(source,0,0,output.getWidth(),output.getHeight(),null);
        } finally { graphics.dispose(); }
        output=orient(output,orientation(bytes));
        var buffer=new ByteArrayOutputStream();ImageIO.write(output,"png",buffer);
        if(buffer.size()>PhotoStorage.MAX_BYTES) throw new AppException(ErrorCode.REQUEST_TOO_LARGE);
        return new PhotoDecoder.Photo(buffer.toByteArray(),output.getWidth(),output.getHeight());
      } finally { reader.dispose(); }
    } catch(IOException|IllegalArgumentException e) { throw invalid(); }
  }
  public byte[] jpeg(byte[] png) {
    try {
      var source=ImageIO.read(new ByteArrayInputStream(png));
      if(source==null) throw invalid();
      double ratio=Math.min(1,1536.0/Math.max(source.getWidth(),source.getHeight()));
      var rgb=new BufferedImage(Math.max(1,(int)(source.getWidth()*ratio)),Math.max(1,(int)(source.getHeight()*ratio)),BufferedImage.TYPE_INT_RGB);
      var g=rgb.createGraphics();try { g.setColor(Color.WHITE);g.fillRect(0,0,rgb.getWidth(),rgb.getHeight());g.drawImage(source,0,0,rgb.getWidth(),rgb.getHeight(),null); } finally { g.dispose(); }
      var out=new ByteArrayOutputStream();ImageIO.write(rgb,"jpeg",out);
      if(out.size()>2*1024*1024) throw invalid();return out.toByteArray();
    } catch(IOException e) { throw invalid(); }
  }
  /** Feed-sized rendition; canonical PNG and embedding input remain independent. */
  public byte[] preview(byte[] png) {
    return jpeg(png,960,0.82f);
  }
  private byte[] jpeg(byte[] png,int maxDimension,float quality) {
    try {
      var source=ImageIO.read(new ByteArrayInputStream(png));
      if(source==null) throw invalid();
      double ratio=Math.min(1,(double)maxDimension/Math.max(source.getWidth(),source.getHeight()));
      var rgb=new BufferedImage(Math.max(1,(int)(source.getWidth()*ratio)),Math.max(1,(int)(source.getHeight()*ratio)),BufferedImage.TYPE_INT_RGB);
      var g=rgb.createGraphics();try { g.setColor(Color.WHITE);g.fillRect(0,0,rgb.getWidth(),rgb.getHeight());
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(source,0,0,rgb.getWidth(),rgb.getHeight(),null); } finally { g.dispose(); }
      var out=new ByteArrayOutputStream();
      var writer=ImageIO.getImageWritersByFormatName("jpeg").next();
      try(var output=ImageIO.createImageOutputStream(out)) {
        writer.setOutput(output);
        var params=writer.getDefaultWriteParam();params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);params.setCompressionQuality(quality);
        writer.write(null,new IIOImage(rgb,null,null),params);
      } finally { writer.dispose(); }
      if(out.size()>2*1024*1024) throw invalid();return out.toByteArray();
    } catch(IOException e) { throw invalid(); }
  }
  // Read only bounded EXIF orientation; never preserve location/device metadata.
  static int orientation(byte[] bytes) {
    try {
      if(bytes.length>4 && (bytes[0]&255)==255 && (bytes[1]&255)==216) {
        int at=2;
        while(at+4<=bytes.length && (bytes[at]&255)==255) {
          int marker=bytes[at+1]&255;if(marker==218 || marker==217) break;
          int length=((bytes[at+2]&255)<<8)|(bytes[at+3]&255);
          if(length<2 || at+2+length>bytes.length) break;
          if(marker==225 && length>=8 && bytes[at+4]=='E' && bytes[at+5]=='x' && bytes[at+6]=='i' && bytes[at+7]=='f') return tiff(bytes,at+10,at+2+length);
          at+=2+length;
        }
      } else if(bytes.length>12 && bytes[0]=='R' && bytes[8]=='W') {
        var buffer=java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN);int at=12;
        while(at+8<=bytes.length) {
          int length=buffer.getInt(at+4);if(length<0 || length>bytes.length-at-8) break;
          if(bytes[at]=='E' && bytes[at+1]=='X' && bytes[at+2]=='I' && bytes[at+3]=='F') {
            int start=at+8;if(length>6 && bytes[start]=='E' && bytes[start+1]=='x') start+=6;return tiff(bytes,start,at+8+length);
          }
          at+=8+length+(length&1);
        }
      }
    } catch(RuntimeException ignored) { }
    return 1;
  }
  private static int tiff(byte[] bytes,int start,int end) {
    if(start<0 || end>bytes.length || end-start<8) return 1;
    boolean little=bytes[start]=='I' && bytes[start+1]=='I';
    if(!little && !(bytes[start]=='M' && bytes[start+1]=='M')) return 1;
    var b=java.nio.ByteBuffer.wrap(bytes).order(little?java.nio.ByteOrder.LITTLE_ENDIAN:java.nio.ByteOrder.BIG_ENDIAN);
    if(b.getShort(start+2)!=42) return 1;long offset=Integer.toUnsignedLong(b.getInt(start+4));
    if(offset<8 || offset>end-start-2) return 1;int at=start+(int)offset,count=Short.toUnsignedInt(b.getShort(at));
    for(int i=0;i<Math.min(count,256);i++) {
      int entry=at+2+i*12;if(entry+12>end) break;
      if(Short.toUnsignedInt(b.getShort(entry))==274 && b.getShort(entry+2)==3 && b.getInt(entry+4)==1) {
        int value=Short.toUnsignedInt(b.getShort(entry+8));return value>=1 && value<=8?value:1;
      }
    }return 1;
  }
  static BufferedImage orient(BufferedImage source,int orientation) {
    if(orientation<=1 || orientation>8) return source;
    int w=source.getWidth(),h=source.getHeight();var result=new BufferedImage(orientation>=5?h:w,orientation>=5?w:h,BufferedImage.TYPE_INT_RGB);
    for(int y=0;y<h;y++) for(int x=0;x<w;x++) {
      int tx=x,ty=y;
      switch(orientation) {
        case 2 -> tx=w-1-x;
        case 3 -> {tx=w-1-x;ty=h-1-y;}
        case 4 -> ty=h-1-y;
        case 5 -> {tx=y;ty=x;}
        case 6 -> {tx=h-1-y;ty=x;}
        case 7 -> {tx=h-1-y;ty=w-1-x;}
        case 8 -> {tx=y;ty=w-1-x;}
      }
      result.setRGB(tx,ty,source.getRGB(x,y));
    }return result;
  }
  private AppException invalid() { return new AppException(ErrorCode.INVALID_PARAMETER); }
}
