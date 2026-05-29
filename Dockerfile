# Lihtne staatilise veebilehe Docker image Nginxi peal
FROM nginx:alpine

# Eemaldame Nginxi vaikimisi lehe
RUN rm -rf /usr/share/nginx/html/*

# Lisame enda veebilehe failid
COPY index.html /usr/share/nginx/html/index.html
COPY style.css /usr/share/nginx/html/style.css
COPY app.js /usr/share/nginx/html/app.js

# Lisame lihtsa Nginxi konfiguratsiooni
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
