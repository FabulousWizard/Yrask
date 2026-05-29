# Maainfo prototüüp Dockeriga

See projekt on staatiline veebileht, mis kasutab HTML-i, CSS-i, JavaScripti ja Leaflet kaarditeeki.
Dockeris jooksutatakse seda Nginxi veebiserveri kaudu.

## Käivitamine Docker Compose'iga

Ava terminal selles kaustas ja käivita:

```bash
docker compose up --build
```

Seejärel ava brauseris:

```text
http://localhost:8080
```

## Käivitamine ilma Docker Compose'ita

```bash
docker build -t maainfo-web .
docker run --name maainfo-web -p 8080:80 maainfo-web
```

Seejärel ava:

```text
http://localhost:8080
```

## Peatamine

Docker Compose puhul:

```bash
docker compose down
```

Tavalise Docker run käsu puhul:

```bash
docker stop maainfo-web
docker rm maainfo-web
```

## Failid

- `index.html` - veebilehe struktuur
- `style.css` - kujundus
- `app.js` - kaardi ja kasutajaliidese loogika
- `Dockerfile` - Docker image'i ehitamine
- `nginx.conf` - Nginxi konfiguratsioon
- `docker-compose.yml` - lihtne Docker Compose käivitus
