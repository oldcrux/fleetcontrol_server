# 📊 Performance & Stress Testing Report

This document outlines the performance benchmarks and stress testing results for the **Fleet Control Reporting & Dashboard Backend Application**.

---

## ⚙️ GCP Test Environment -

| Component     | Machine Type  | vCPU      | Memory (GB) | Disk (GB) | Disk Type  |
|---------------|--------------|-----------|-------------|-----------|------------|
| PostgreSQL DB | e2-small     | 2         | 8           | 10        | SSD        |
| Nginx         | e2-standard  | 2 (1 shared) | 2        | 10        | Standard   |
| Node App      | e2-standard  | 2         | 8           | 20        | Standard   |
| Node Server   | e2-standard  | 2         | 8           | 20        | Standard   |
| QuestDB       | e2-small     | 2         | 8           | 50        | Standard   |
| Redis         | e2-standard  | 2 (1 shared) | 4        | 10        | Standard   |

---

## 📡 Load Test Setup

- **Simulator:** Custom TCP simulator  
- **Devices simulated:** 500  
- **Message frequency:** 1 message / 10 seconds per device  
- **Total message throughput:** ~50 messages/second  

---

## 📈 Observations

- **PostgreSQL (with PostGIS):**  
  - CPU utilization reached ~60% under load.  
  - Primary load comes from geospatial queries and geofence calculations.  

- **PostgreSQL (without PostGIS):**  
  - CPU utilization stayed <10%.  
  - Non-geospatial workloads remain lightweight.  

- **Redis:**  
  - Memory usage remained stable due to aggressive cache hit ratio.  
  - CPU utilization negligible.  

- **QuestDB:**  
  - Efficient ingestion of high-frequency telemetry.  
  - Disk I/O stable due to append-only storage model.  

- **Node Application + Server:**  
  - Both scaled comfortably within 2 vCPU, 8GB RAM instances.  
  - Average request latency remained <100ms during the test.  

---

## 🚀 Key Takeaways

1. The application comfortably handled **500 devices sending telemetry at 10-second intervals** (~50 msg/sec).  
2. **PostGIS is the primary resource driver** – enabling geospatial queries pushes PostgreSQL CPU usage up to ~60%.  
3. Without PostGIS, the system remains very lightweight (<10% PostgreSQL utilization).  
4. The system is horizontally scalable — more Node servers or a larger PostgreSQL instance can support higher telemetry loads.  
