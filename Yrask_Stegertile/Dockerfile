FROM nginx:alpine

RUN apk add --no-cache python3

RUN rm -rf /usr/share/nginx/html/*

COPY index.html /usr/share/nginx/html/index.html
COPY style.css /usr/share/nginx/html/style.css
COPY app.js /usr/share/nginx/html/app.js
COPY data/weather.xml /usr/share/nginx/html/data/weather.xml

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY update_weather_xml.py /opt/update_weather_xml.py
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh /opt/update_weather_xml.py     && mkdir -p /usr/share/nginx/html/data

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
