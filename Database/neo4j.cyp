// Mỗi khối là một query độc lập, chạy nguyên khối trong một transaction.
// Backend phải lấy actor từ JWT: request/block/unblock $from là actor;
// accept $to là actor. File này không triển khai xác thực hay ACL SQL.
// Các thao tác ghi bên dưới khóa hai User theo thứ tự id TRƯỚC khi đọc quan hệ.
// Thuộc tính tạm _loccoc_pair_lock được dành riêng cho cơ chế khóa và xóa ngay;
// write lock vẫn giữ tới commit/rollback, không cần APOC.
// Tất cả writer quan hệ của cặp User phải tuân theo cùng giao thức khóa.
// https://neo4j.com/docs/operations-manual/current/database-internals/concurrent-data-access/

// name: constraint
CREATE CONSTRAINT user_id_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

// name: request
// Gửi lời mời kết bạn; chặn từ bất kỳ chiều nào đều ngăn gửi.
MATCH (a:User {id: $from}), (b:User {id: $to})
WITH a, b,
     CASE WHEN a.id < b.id THEN a ELSE b END AS first,
     CASE WHEN a.id < b.id THEN b ELSE a END AS second
SET first._loccoc_pair_lock = true
REMOVE first._loccoc_pair_lock
SET second._loccoc_pair_lock = true
REMOVE second._loccoc_pair_lock
WITH a, b
WHERE NOT (a)-[:BLOCKED]-(b) AND NOT (a)-[:FRIEND]-(b)
MERGE (a)-[r:REQUESTED]->(b)
ON CREATE SET r.at = datetime()
RETURN r;

// name: accept
// Chấp nhận lời mời; kiểm tra lại block sau khi có khóa, kể cả request cũ.
MATCH (a:User {id: $from}), (b:User {id: $to})
WITH a, b,
     CASE WHEN a.id < b.id THEN a ELSE b END AS first,
     CASE WHEN a.id < b.id THEN b ELSE a END AS second
SET first._loccoc_pair_lock = true
REMOVE first._loccoc_pair_lock
SET second._loccoc_pair_lock = true
REMOVE second._loccoc_pair_lock
WITH a, b
MATCH (a)-[r:REQUESTED]->(b)
WHERE NOT (a)-[:BLOCKED]-(b)
DELETE r
MERGE (a)-[f:FRIEND]-(b)          // MERGE vô hướng: chỉ tạo 1 cạnh
ON CREATE SET f.since = datetime();

// name: block
// Chặn một chiều; xóa FRIEND và REQUESTED ở CẢ HAI chiều trong cùng transaction.
MATCH (a:User {id: $from}), (b:User {id: $to})
WHERE a <> b
WITH a, b,
     CASE WHEN a.id < b.id THEN a ELSE b END AS first,
     CASE WHEN a.id < b.id THEN b ELSE a END AS second
SET first._loccoc_pair_lock = true
REMOVE first._loccoc_pair_lock
SET second._loccoc_pair_lock = true
REMOVE second._loccoc_pair_lock
WITH a, b
MERGE (a)-[blocked:BLOCKED]->(b)
ON CREATE SET blocked.at = datetime()
WITH a, b, blocked
OPTIONAL MATCH (a)-[stale:FRIEND|REQUESTED]-(b)
WITH blocked, collect(stale) AS staleRelationships
FOREACH (stale IN staleRelationships | DELETE stale)
RETURN blocked;

// name: unblock
// Chỉ bỏ block DO actor tạo; không bỏ block ngược, không tự khôi phục bạn/lời mời.
MATCH (a:User {id: $from}), (b:User {id: $to})
WITH a, b,
     CASE WHEN a.id < b.id THEN a ELSE b END AS first,
     CASE WHEN a.id < b.id THEN b ELSE a END AS second
SET first._loccoc_pair_lock = true
REMOVE first._loccoc_pair_lock
SET second._loccoc_pair_lock = true
REMOVE second._loccoc_pair_lock
WITH a, b
MATCH (a)-[blocked:BLOCKED]->(b)
DELETE blocked;

// name: friends
// Danh sách bạn bè dùng khi fan-out; phòng vệ cả dữ liệu cũ có FRIEND + BLOCKED.
MATCH (me:User {id: $me})-[:FRIEND]-(f:User)
WHERE NOT (me)-[:BLOCKED]-(f)
RETURN f.id;

// name: mutual
// Không lộ bạn chung giữa cặp bị chặn hoặc qua friendship đã bị chặn.
MATCH (me:User {id: $me})-[:FRIEND]-(m:User)-[:FRIEND]-(other:User {id: $other})
WHERE NOT (me)-[:BLOCKED]-(other)
  AND NOT (me)-[:BLOCKED]-(m)
  AND NOT (other)-[:BLOCKED]-(m)
RETURN m.id;

// name: suggestions
// Gợi ý kết bạn; không dùng friendship bị chặn làm đường gợi ý.
MATCH (me:User {id: $me})-[:FRIEND]-(m:User)-[:FRIEND]-(s:User)
WHERE s <> me
  AND NOT (me)-[:FRIEND]-(s)
  AND NOT (me)-[:BLOCKED]-(s)
  AND NOT (me)-[:BLOCKED]-(m)
  AND NOT (m)-[:BLOCKED]-(s)
  AND NOT (me)-[:REQUESTED]-(s)
RETURN s.id, count(*) AS mutual
ORDER BY mutual DESC
LIMIT 20;
