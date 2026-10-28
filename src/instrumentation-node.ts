import net from "node:net";

/**
 * Node 는 IPv4 연결이 250ms 안에 안 되면 IPv6 로 넘어가는데, 운영 서버는 IPv6 가 없고
 * 유럽(Open-Meteo 바다 예보)까지 왕복이 약 260ms 라서 연결이 매번 실패했다. 기다리는 시간을 늘린다.
 */
net.setDefaultAutoSelectFamilyAttemptTimeout(2500);
