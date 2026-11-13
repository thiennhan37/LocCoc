import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const OUT_DIR = 'D:/PTPM_HDV/LocCoc/.codex-output';
const DRAFT = path.join(OUT_DIR, 'Edge_Feature_Phat_Hien_Loi_Ngoai_Quan_draft.pptx');
await fs.mkdir(OUT_DIR, { recursive: true });

const W = 1280, H = 720;
const C = {
  navy: '#0B1F33',
  navy2: '#102C46',
  navy3: '#163A5C',
  cyan: '#19D3E6',
  cyan2: '#8FEAF2',
  white: '#F6FBFF',
  muted: '#A9BDCC',
  ink: '#102A43',
  gray: '#D6E1E8',
  gray2: '#EFF4F7',
  red: '#F26B6B',
  green: '#57D0A4',
  yellow: '#F5C56B',
  black: '#07131F',
};
const FONT = 'Arial';
const MONO = 'Consolas';

const p = Presentation.create({ slideSize: { width: W, height: H } });

function addShape(slide, geometry, left, top, width, height, fill='none', lineFill='none', lineWidth=0, extra={}) {
  return slide.shapes.add({ geometry, position: { left, top, width, height }, fill, line: { style: 'solid', fill: lineFill, width: lineWidth }, ...extra });
}
function addText(slide, text, left, top, width, height, style={}) {
  const s = addShape(slide, 'textbox', left, top, width, height, 'none', 'none', 0);
  s.text = text;
  s.text.style = { fontFamily: FONT, fontSize: 20, color: C.ink, ...style };
  return s;
}
function addTitle(slide, kicker, title, page) {
  addText(slide, kicker.toUpperCase(), 68, 34, 360, 24, { fontSize: 13, bold: true, color: C.cyan, letterSpacing: 1.2 });
  addText(slide, title, 68, 64, 1060, 54, { fontSize: 34, bold: true, color: C.white });
  addShape(slide, 'rect', 68, 124, 90, 4, C.cyan, 'none', 0);
  addText(slide, String(page).padStart(2, '0'), 1180, 34, 40, 24, { fontSize: 14, bold: true, color: C.muted, align: 'right' });
}
function note(slide, text) { slide.speakerNotes.text = text; slide.speakerNotes.setVisible(true); }
function bulletText(items) { return items.map(x => `• ${x}`).join('\n'); }
function addArrow(slide, left, top, width=92, color=C.cyan) {
  addShape(slide, 'rightArrow', left, top, width, 28, color, 'none', 0);
}
function addStep(slide, x, y, w, h, label, detail, accent=C.cyan) {
  addShape(slide, 'roundRect', x, y, w, h, C.navy2, accent, 1, { borderRadius: 'rounded-xl' });
  addText(slide, label, x+18, y+16, w-36, 28, { fontSize: 18, bold: true, color: accent });
  addText(slide, detail, x+18, y+50, w-36, h-60, { fontSize: 16, color: C.white, lineSpacing: 1.08 });
}

// Slide 1
{
  const s = p.slides.add(); s.background.fill = C.navy;
  addShape(s, 'rect', 0, 0, 1280, 720, C.navy, 'none', 0);
  addShape(s, 'rect', 820, 0, 460, 720, C.navy2, 'none', 0);
  // Explanatory edge-map motif (editable diagram)
  addShape(s, 'roundRect', 855, 90, 305, 475, C.black, C.cyan, 2, { borderRadius: 'rounded-2xl' });
  addShape(s, 'roundRect', 884, 120, 247, 418, '#112A42', '#315C78', 1, { borderRadius: 'rounded-xl' });
  addShape(s, 'rect', 918, 165, 180, 8, C.cyan, 'none', 0);
  addShape(s, 'rect', 918, 198, 150, 8, C.cyan2, 'none', 0);
  addShape(s, 'rect', 918, 231, 118, 8, '#4C7895', 'none', 0);
  // crack lines
  addShape(s, 'rect', 1004, 300, 3, 120, C.cyan, 'none', 0);
  addShape(s, 'rect', 1004, 355, 58, 3, C.cyan, 'none', 0);
  addShape(s, 'rect', 947, 405, 60, 3, C.cyan, 'none', 0);
  addShape(s, 'rect', 947, 405, 3, 64, C.cyan, 'none', 0);
  addShape(s, 'rect', 950, 467, 82, 3, C.cyan, 'none', 0);
  addText(s, 'EDGE MAP', 904, 575, 208, 24, { fontSize: 14, bold: true, color: C.cyan, align: 'center', letterSpacing: 1.4 });
  addText(s, 'XỬ LÝ ẢNH', 72, 78, 300, 26, { fontSize: 16, bold: true, color: C.cyan, letterSpacing: 1.6 });
  addText(s, 'Edge Feature', 72, 140, 660, 78, { fontSize: 56, bold: true, color: C.white });
  addText(s, 'Đặc trưng biên trong phát hiện lỗi ngoại quan', 74, 234, 640, 70, { fontSize: 28, color: C.cyan2, bold: true });
  addText(s, 'Đồ án: Hệ thống phát hiện lỗi ngoại quan trên thiết bị điện tử bằng xử lý ảnh và Deep Learning', 74, 334, 610, 70, { fontSize: 19, color: C.white, lineSpacing: 1.18 });
  addShape(s, 'rect', 74, 448, 540, 1, '#2E5773', 'none', 0);
  addText(s, 'Trường: [Điền tên trường]\nMôn học: Xử lý ảnh\nGVHD: [Điền tên giảng viên]\nNhóm: [Điền họ tên + mã sinh viên]\nNgười trình bày: [Điền họ tên]', 74, 472, 600, 150, { fontSize: 16, color: C.muted, lineSpacing: 1.25 });
  note(s, 'Mở đầu bằng mục tiêu của bài: hiểu Edge Feature, xem cách triển khai Canny bằng OpenCV và đặt nó vào pipeline phát hiện lỗi trên điện thoại. Các trường thông tin nhóm đang để placeholder để chỉnh sửa.');
}

// Slide 2
{
  const s = p.slides.add(); s.background.fill = C.navy;
  addTitle(s, '01 · Khái niệm', 'Edge Feature và vị trí của biên ảnh', 2);
  addText(s, 'Biên là nơi cường độ sáng thay đổi nhanh theo không gian. Edge Feature mô tả các cấu trúc đường này để hỗ trợ phân tích hình dạng và bất thường.', 68, 156, 570, 70, { fontSize: 21, color: C.white, lineSpacing: 1.15 });
  addText(s, 'Cường độ sáng I(x, y)', 70, 252, 250, 26, { fontSize: 15, color: C.muted, bold: true });
  // intensity profile
  addShape(s, 'rect', 74, 300, 470, 3, '#4D738A', 'none', 0);
  addShape(s, 'rect', 120, 220, 3, 160, C.cyan2, 'none', 0);
  addShape(s, 'rect', 120, 220, 170, 3, C.cyan2, 'none', 0);
  addShape(s, 'rect', 290, 220, 3, 160, C.cyan, 'none', 0);
  addShape(s, 'rect', 290, 380, 190, 3, C.cyan, 'none', 0);
  addText(s, 'vùng tối', 148, 392, 100, 22, { fontSize: 14, color: C.muted, align: 'center' });
  addText(s, 'biên', 262, 192, 64, 22, { fontSize: 14, color: C.cyan, bold: true, align: 'center' });
  addText(s, 'vùng sáng', 355, 392, 110, 22, { fontSize: 14, color: C.muted, align: 'center' });
  addText(s, 'Gradient |∇I| lớn', 236, 250, 170, 26, { fontSize: 16, color: C.cyan, bold: true });
  // before/after illustration
  addText(s, 'Minh họa trên bề mặt điện thoại', 690, 156, 420, 26, { fontSize: 15, color: C.muted, bold: true });
  addShape(s, 'roundRect', 690, 204, 230, 310, '#173149', '#3F6780', 1, { borderRadius: 'rounded-xl' });
  addShape(s, 'roundRect', 725, 240, 160, 220, '#294D63', 'none', 0, { borderRadius: 'rounded-xl' });
  addShape(s, 'rect', 773, 278, 4, 108, '#D2E9F0', 'none', 0);
  addShape(s, 'rect', 773, 330, 56, 4, '#D2E9F0', 'none', 0);
  addShape(s, 'rect', 829, 330, 4, 44, '#D2E9F0', 'none', 0);
  addText(s, 'Ảnh gốc\n(vết nứt / xước)', 706, 526, 200, 44, { fontSize: 16, color: C.white, align: 'center' });
  addShape(s, 'roundRect', 960, 204, 230, 310, C.black, C.cyan, 1, { borderRadius: 'rounded-xl' });
  addShape(s, 'rect', 1074, 278, 4, 108, C.cyan, 'none', 0);
  addShape(s, 'rect', 1074, 330, 56, 4, C.cyan, 'none', 0);
  addShape(s, 'rect', 1130, 330, 4, 44, C.cyan, 'none', 0);
  addText(s, 'Ảnh biên\n(đường nổi bật)', 976, 526, 200, 44, { fontSize: 16, color: C.white, align: 'center' });
  addText(s, 'Trong đồ án, đường biên của vết xước hoặc vết nứt là tín hiệu để khoanh vùng bất thường. Biên của vật thể bình thường vẫn có thể xuất hiện.', 690, 600, 500, 54, { fontSize: 16, color: C.cyan2, lineSpacing: 1.1 });
  note(s, 'Giải thích trực giác: gradient là đạo hàm theo không gian. Khi cường độ sáng đổi nhanh, độ lớn gradient tăng và ta có một vị trí biên. Liên hệ với vết xước, vết nứt nhưng nhấn mạnh rằng biên cũng xuất hiện ở đường viền bình thường của điện thoại.');
}

// Slide 3
{
  const s = p.slides.add(); s.background.fill = C.navy;
  addTitle(s, '02 · Nguyên lý', 'Từ gradient đến ảnh biên', 3);
  addText(s, 'Các thuật toán khác nhau ở cách xấp xỉ đạo hàm, giảm nhiễu và chọn điểm biên. Canny phù hợp để minh họa vì có pipeline rõ ràng và thường cho đường biên mảnh.', 68, 156, 1140, 50, { fontSize: 19, color: C.white });
  addStep(s, 72, 260, 195, 124, 'Sobel', 'Đạo hàm bậc nhất theo x, y; nhanh và dễ hiểu.', C.cyan);
  addStep(s, 291, 260, 195, 124, 'Prewitt', 'Kernel đơn giản; nhạy với nhiễu hơn khi chưa làm mượt.', C.cyan2);
  addStep(s, 510, 260, 195, 124, 'Laplacian', 'Đạo hàm bậc hai; bắt zero-crossing nhưng dễ nhiễu.', C.yellow);
  addStep(s, 729, 260, 195, 124, 'Canny', 'Làm mượt, gradient, non-maximum suppression, hysteresis.', C.green);
  addText(s, 'Lựa chọn minh họa', 950, 260, 210, 28, { fontSize: 17, bold: true, color: C.cyan });
  addText(s, 'Canny\n• đường biên mảnh\n• có hai ngưỡng\n• dễ triển khai với OpenCV', 950, 300, 240, 110, { fontSize: 17, color: C.white, lineSpacing: 1.18 });
  addText(s, 'Pipeline Canny', 72, 460, 220, 26, { fontSize: 16, color: C.muted, bold: true });
  const xs=[72, 300, 528, 756, 984];
  const labels=[['Ảnh đầu vào','phone.jpg'],['Ảnh xám','1 kênh'],['Giảm nhiễu','Gaussian (5×5)'],['Gradient','độ lớn + hướng'],['Ảnh biên','Canny 50 / 150']];
  for(let i=0;i<xs.length;i++) { addShape(s,'roundRect',xs[i],514,170,76,C.navy2,C.cyan,1,{borderRadius:'rounded-lg'}); addText(s,labels[i][0],xs[i]+12,528,146,22,{fontSize:16,bold:true,color:C.white,align:'center'}); addText(s,labels[i][1],xs[i]+12,554,146,18,{fontSize:13,color:C.cyan2,align:'center'}); if(i<xs.length-1) addArrow(s,xs[i]+180,538,38,C.cyan); }
  note(s, 'Nêu bốn họ thuật toán ở mức khái quát. Canny được chọn cho code minh họa vì thể hiện đủ các bước và có API cv2.Canny. Pipeline trên slide sẽ được nối trực tiếp với code ở slide sau. Nguồn: OpenCV Sobel tutorial và Canny tutorial.');
}

// Slide 4
{
  const s = p.slides.add(); s.background.fill = C.navy;
  addTitle(s, '03 · Triển khai', 'Code Canny bằng Python và OpenCV', 4);
  addText(s, 'Cài thư viện: pip install opencv-python', 68, 154, 500, 30, { fontSize: 17, color: C.cyan2, bold: true });
  const code = `import cv2\n\n# Đọc ảnh đầu vào\nimage = cv2.imread("phone.jpg")\nif image is None:\n    raise FileNotFoundError("Không đọc được phone.jpg")\n\n# Chuyển sang ảnh xám và giảm nhiễu\ngray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)\nblur = cv2.GaussianBlur(gray, (5, 5), 1.0)\n\n# Phát hiện biên bằng Canny\nedges = cv2.Canny(blur, 50, 150)\n\n# Hiển thị ảnh gốc và ảnh biên\ncv2.imshow("Original", image)\ncv2.imshow("Edges", edges)\ncv2.waitKey(0)\ncv2.destroyAllWindows()`;
  addShape(s, 'roundRect', 68, 202, 760, 430, C.black, '#2A5874', 1, { borderRadius: 'rounded-xl' });
  addText(s, code, 92, 222, 710, 390, { fontFamily: MONO, fontSize: 16, color: '#E6F6FA', lineSpacing: 1.03 });
  addShape(s, 'roundRect', 884, 202, 320, 180, C.navy2, C.cyan, 1, { borderRadius: 'rounded-xl' });
  addText(s, 'Tham số minh họa', 910, 224, 260, 26, { fontSize: 18, bold: true, color: C.cyan });
  addText(s, 'Gaussian Blur\nKernel (5, 5)\nSigma = 1.0\n\nCanny\nNgưỡng thấp = 50\nNgưỡng cao = 150', 910, 266, 250, 100, { fontSize: 16, color: C.white, lineSpacing: 1.18 });
  addShape(s, 'roundRect', 884, 416, 320, 216, C.navy2, C.green, 1, { borderRadius: 'rounded-xl' });
  addText(s, 'Kỳ vọng đầu ra', 910, 438, 260, 26, { fontSize: 18, bold: true, color: C.green });
  addText(s, 'Ảnh “Edges” là ảnh nhị phân: pixel sáng biểu diễn các vị trí có khả năng là biên. Đây là tín hiệu phân tích, chưa phải nhãn lỗi.', 910, 482, 246, 112, { fontSize: 17, color: C.white, lineSpacing: 1.18 });
  note(s, 'Đọc code theo thứ tự trên slide. Nhấn mạnh kiểm tra image is None để tránh chạy tiếp với ảnh rỗng. Canny nhận ảnh đã làm mượt, rồi trả về ảnh nhị phân. Code có thể chạy độc lập nếu đặt phone.jpg cùng thư mục.');
}

// Slide 5
{
  const s = p.slides.add(); s.background.fill = C.navy;
  addTitle(s, '04 · Giải thích', 'Mỗi bước trong code phục vụ điều gì?', 5);
  const rows=[
    ['01', 'cv2.imread()', 'Đọc ảnh BGR từ file. Kiểm tra None để phát hiện đường dẫn sai hoặc file hỏng.', C.cyan],
    ['02', 'cv2.cvtColor()', 'Đổi BGR sang grayscale để giảm bài toán còn một kênh cường độ sáng.', C.cyan2],
    ['03', 'GaussianBlur()', 'Làm mượt nhiễu cao tần, hạn chế biên giả trước khi tính gradient.', C.yellow],
    ['04', 'cv2.Canny()', 'Dùng ngưỡng 50 và 150 để giữ biên mạnh và nối biên yếu có liên kết.', C.green],
  ];
  for(let i=0;i<rows.length;i++){
    const y=176+i*103;
    addShape(s,'rect',68,y,56,56,rows[i][3],'none',0);
    addText(s,rows[i][0],68,y+15,56,24,{fontSize:16,bold:true,color:C.navy,align:'center'});
    addText(s,rows[i][1],152,y+8,250,26,{fontSize:21,bold:true,color:C.white});
    addText(s,rows[i][2],420,y+7,730,46,{fontSize:18,color:C.white,lineSpacing:1.12});
    addShape(s,'rect',152,y+70,998,1,'#244A64','none',0);
  }
  addShape(s,'roundRect',68,600,1080,52,C.navy2,C.cyan,1,{borderRadius:'rounded-lg'});
  addText(s,'Hai ngưỡng Canny: 50 lọc điểm yếu; 150 xác nhận biên mạnh. Tăng ngưỡng giúp ít nhiễu hơn nhưng có thể bỏ sót vết xước mờ.',92,615,1028,24,{fontSize:17,color:C.cyan2,bold:true});
  note(s, 'Giải thích mục đích chứ không chỉ đọc cú pháp. Grayscale làm cho gradient phản ánh thay đổi độ sáng. Gaussian Blur giảm nhiễu. Hai ngưỡng tạo cơ chế hysteresis của Canny. Điều chỉnh ngưỡng cần kiểm chứng trên dữ liệu thực tế, không có một bộ số đúng cho mọi ảnh.');
}

// Slide 6
{
  const s = p.slides.add(); s.background.fill = C.navy;
  addTitle(s, '05 · Đánh giá', 'Ưu điểm và giới hạn của Edge Feature', 6);
  addShape(s,'rect',68,168,540,50,C.green,'none',0); addText(s,'ƯU ĐIỂM',92,184,220,22,{fontSize:17,bold:true,color:C.navy});
  addShape(s,'rect',660,168,540,50,C.red,'none',0); addText(s,'NHƯỢC ĐIỂM',684,184,240,22,{fontSize:17,bold:true,color:C.white});
  const pros=['Dễ triển khai, tốc độ xử lý nhanh.','Làm nổi bật cấu trúc đường biên và chi tiết dạng đường.','Hỗ trợ phân tích hình dạng, vị trí của vết nứt hoặc vết xước.','Có thể kết hợp với lọc, phân đoạn hoặc mô hình AI.'];
  const cons=['Nhạy với nhiễu và điều kiện chiếu sáng.','Phản xạ, hoa văn và đường viền bình thường có thể tạo biên giả.','Khó thấy vết xước mờ hoặc tương phản thấp.','Không tự phân biệt biên lỗi với biên vật thể bình thường.','Không tự phân loại lỗi khi dùng riêng.'];
  addText(s,pros.map(x=>'✓  '+x).join('\n\n'),92,250,490,300,{fontSize:19,color:C.white,lineSpacing:1.18});
  addText(s,cons.map(x=>'×  '+x).join('\n\n'),684,250,486,340,{fontSize:19,color:C.white,lineSpacing:1.12});
  addShape(s,'rect',68,616,1132,1,'#2D5D78','none',0);
  addText(s,'Thông điệp: Edge Detection tìm đường có biến thiên cường độ. Nhận diện lỗi cần thêm logic, đặc trưng khác hoặc mô hình học máy.',68,630,1110,32,{fontSize:18,color:C.cyan2,bold:true});
  note(s, 'Dùng slide này để đặt kỳ vọng đúng. Edge Feature hữu ích khi lỗi có hình dạng đường rõ, nhưng biên giả là vấn đề chính trên bề mặt phản xạ. Phần nhận diện lỗi cần bước sau như phân đoạn, luật hình học hoặc mô hình AI.');
}

// Slide 7
{
  const s = p.slides.add(); s.background.fill = C.navy;
  addTitle(s, '06 · Phạm vi dùng', 'Khi nào nên dùng Edge Feature?', 7);
  addShape(s,'roundRect',68,170,520,410,C.navy2,C.green,1,{borderRadius:'rounded-xl'});
  addText(s,'NÊN DÙNG',96,196,220,28,{fontSize:22,bold:true,color:C.green});
  addText(s,bulletText(['Phát hiện hoặc phân tích vết nứt, vết xước dạng đường.','Xác định đường viền và hình dạng vùng bất thường.','Làm tín hiệu hỗ trợ trước phân đoạn hoặc phân loại.','Kết hợp với hiệu chỉnh ánh sáng, texture hoặc mô hình AI.']),96,246,440,264,{fontSize:19,color:C.white,lineSpacing:1.18});
  addShape(s,'roundRect',660,170,540,410,C.navy2,C.red,1,{borderRadius:'rounded-xl'});
  addText(s,'KHÔNG NÊN PHỤ THUỘC MỘT MÌNH',688,196,440,28,{fontSize:22,bold:true,color:C.red});
  addText(s,bulletText(['Lỗi có độ tương phản thấp hoặc biên không liên tục.','Bề mặt phản chiếu mạnh hoặc có nhiều hoa văn.','Lỗi chủ yếu thể hiện qua màu sắc hoặc kết cấu.','Bài toán cần nhận diện và phân loại nhiều loại lỗi phức tạp.']),688,246,450,264,{fontSize:19,color:C.white,lineSpacing:1.18});
  addText(s,'Quyết định dùng Edge Feature phụ thuộc vào chất lượng ảnh và dạng lỗi cần tìm.',68,620,1130,30,{fontSize:18,color:C.cyan2,bold:true,align:'center'});
  note(s, 'Cho người nghe một quy tắc thực hành: xem lỗi có tạo đường biên rõ hay không. Nếu không, cần bổ sung màu sắc, texture, ánh sáng hoặc học sâu.');
}

// Slide 8
{
  const s = p.slides.add(); s.background.fill = C.navy;
  addTitle(s, '07 · Liên hệ đồ án', 'Vị trí của Edge Feature trong pipeline phát hiện lỗi', 8);
  addText(s,'Edge Detection có thể là công cụ phân tích hoặc bước tiền xử lý. Nó không bắt buộc phải là đầu vào của YOLO.',68,154,1100,42,{fontSize:20,color:C.white});
  const x=[70,270,470,670,870,1070];
  const lab=[['Ảnh điện thoại','camera'],['Hiệu chỉnh','phối cảnh / sáng'],['Giảm nhiễu','lọc phù hợp'],['Phân tích biên','Canny / Sobel'],['Khoanh vùng','logic / mask'],['Nhận diện lỗi','AI nếu cần']];
  for(let i=0;i<x.length;i++){ addShape(s,'roundRect',x[i],250,150,110,i===3?C.navy3:C.navy2,i===3?C.cyan:'#31556D',1,{borderRadius:'rounded-lg'}); addText(s,lab[i][0],x[i]+10,270,130,24,{fontSize:16,bold:true,color:C.white,align:'center'}); addText(s,lab[i][1],x[i]+10,304,130,22,{fontSize:14,color:i===3?C.cyan2:C.muted,align:'center'}); if(i<x.length-1) addArrow(s,x[i]+158,310,32,C.cyan); }
  addShape(s,'roundRect',70,430,500,140,C.navy2,C.cyan,1,{borderRadius:'rounded-xl'});
  addText(s,'Phát hiện biên',98,454,220,26,{fontSize:22,bold:true,color:C.cyan});
  addText(s,'Tìm vị trí có biến thiên cường độ sáng lớn.',98,502,410,28,{fontSize:18,color:C.white});
  addShape(s,'roundRect',660,430,520,140,C.navy2,C.green,1,{borderRadius:'rounded-xl'});
  addText(s,'Phát hiện lỗi',688,454,220,26,{fontSize:22,bold:true,color:C.green});
  addText(s,'Cần thêm tiêu chí hình dạng, ngữ cảnh hoặc mô hình để quyết định đó là lỗi.',688,502,450,46,{fontSize:18,color:C.white});
  addText(s,'Ví dụ trên ảnh điện thoại là đề xuất minh họa. Độ chính xác cần được kiểm chứng bằng dữ liệu thực tế của đồ án.',70,620,1110,32,{fontSize:17,color:C.cyan2,bold:true,align:'center'});
  note(s, 'Nêu rõ ranh giới khái niệm: Edge Detection chỉ tạo tín hiệu đường biên. Để kết luận lỗi, pipeline phải dùng thêm vùng quan tâm, tiêu chí hình học hoặc mô hình AI. Không tuyên bố độ chính xác nếu chưa có dữ liệu kiểm chứng.');
}

// Slide 9
{
  const s = p.slides.add(); s.background.fill = C.navy;
  addTitle(s, '08 · Kết luận', 'Edge Feature là tín hiệu hỗ trợ cho bài toán lỗi ngoại quan', 9);
  addShape(s,'roundRect',68,170,560,220,C.navy2,C.cyan,1,{borderRadius:'rounded-xl'});
  addText(s,'Ba ý cần nhớ',96,198,240,28,{fontSize:22,bold:true,color:C.cyan});
  addText(s,'1  Biên xuất hiện khi cường độ sáng thay đổi nhanh.\n2  Canny là một thuật toán minh họa, không phải toàn bộ khái niệm Edge Feature.\n3  Trong đồ án, biên giúp phân tích và khoanh vùng; nhận diện lỗi cần thêm logic hoặc AI.',96,246,470,110,{fontSize:18,color:C.white,lineSpacing:1.2});
  addShape(s,'roundRect',680,170,520,220,C.navy2,C.green,1,{borderRadius:'rounded-xl'});
  addText(s,'Tài liệu tham khảo',708,198,300,28,{fontSize:22,bold:true,color:C.green});
  addText(s,'OpenCV, “Canny Edge Detection”\ndocs.opencv.org/4.x/da/d22/tutorial_py_canny.html\n\nOpenCV, “Sobel Derivatives”\ndocs.opencv.org/4.11.0/d2/d2c/tutorial_sobel_derivatives.html\n\nCanny, J. (1986), IEEE TPAMI, DOI 10.1109/TPAMI.1986.4767851',708,240,450,126,{fontSize:15,color:C.white,lineSpacing:1.13});
  addShape(s,'rect',68,448,1132,1,'#2D5D78','none',0);
  addText(s,'Cảm ơn!',68,492,520,70,{fontSize:42,bold:true,color:C.white});
  addText(s,'Q&A · [Điền tên người trình bày]',68,574,540,32,{fontSize:20,color:C.cyan2});
  addText(s,'Placeholder nhóm và thông tin môn học vẫn có thể chỉnh sửa trực tiếp trong PowerPoint.',680,510,500,70,{fontSize:17,color:C.muted,lineSpacing:1.15});
  note(s, 'Kết luận ngắn gọn rồi chuyển sang hỏi đáp. Nhắc lại rằng các nguồn chính là tài liệu OpenCV và bài báo Canny.');
}

const pptx = await PresentationFile.exportPptx(p);
await pptx.save(DRAFT);
console.log(DRAFT);

