FROM node:6-alpine

ARG NODE_ENV
ENV NODE_ENV ${NODE_ENV:-production}

COPY bin/ /opt/swag2post/bin
COPY lib/ /opt/swag2post/lib
COPY package.json /opt/swag2post/package.json

WORKDIR /opt/swag2post
RUN npm install -g

WORKDIR /mnt
VOLUME ["/mnt"]

ENTRYPOINT ["swag2post"]
CMD ["--help"]
