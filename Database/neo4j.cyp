// Constraint + index
CREATE CONSTRAINT user_id_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

// Gửi lời mời kết bạn
MATCH (a:User {id: $from}), (b:User {id: $to})
WHERE NOT (a)-[:BLOCKED]-(b) AND NOT (a)-[:FRIEND]-(b)
MERGE (a)-[r:REQUESTED]->(b)
ON CREATE SET r.at = datetime()
RETURN r;

// Chấp nhận lời mời
MATCH (a:User {id: $from})-[r:REQUESTED]->(b:User {id: $to})
DELETE r
MERGE (a)-[f:FRIEND]-(b)          // MERGE vô hướng: chỉ tạo 1 cạnh
ON CREATE SET f.since = datetime();

// Danh sách bạn bè (dùng khi fan-out ảnh)
MATCH (:User {id: $me})-[:FRIEND]-(f:User)
RETURN f.id;

// Bạn chung
MATCH (:User {id: $me})-[:FRIEND]-(m:User)-[:FRIEND]-(:User {id: $other})
RETURN m.id;

// Gợi ý kết bạn (bạn của bạn, chưa là bạn, chưa chặn)
MATCH (me:User {id: $me})-[:FRIEND]-(:User)-[:FRIEND]-(s:User)
WHERE s <> me
  AND NOT (me)-[:FRIEND]-(s)
  AND NOT (me)-[:BLOCKED]-(s)
  AND NOT (me)-[:REQUESTED]-(s)
RETURN s.id, count(*) AS mutual
ORDER BY mutual DESC
LIMIT 20;