const config = require('./config.json')
import fs, { stat } from 'fs';
import http, { IncomingMessage, ServerResponse } from 'http';
import https from 'https';
import url from 'url';
import path, { dirname } from 'path';
import mime from 'mime';

let server: http.Server | https.Server;

if(config.useHTTPS) {
    const httpsArgs = {
        key: fs.readFileSync(config.httpsKey),
        cert: fs.readFileSync(config.httpsCert)
    }
    server = https.createServer(httpsArgs, requestHandler)
} else {
    server = http.createServer(requestHandler)
}

function requestHandler(request: IncomingMessage, response: ServerResponse) {
    const parsed = url.parse(request.url || '/', true);
    const path_ = decodeURI(parsed.pathname || '/');
    const serversidePath = path.join(config.serverRoot + path_);
    const defaultPagePath = path.join(config.serverRoot + config.defaultPage);
    const finalPath = config.useDefaultPage && request.url == '/' ? path.normalize(defaultPagePath) : serversidePath;

    function showError(code: number, log: boolean = config.logErrors, info: string = 'no more information about the error was provided.') {
        if (log) {
            console.log(`Error ${code} - ${info}`)
        }
        if (!response.headersSent) {
            switch (code) {
                case 500:
                    response.writeHead(500, {"content-type" : 'text/plain'});
                    response.end("500 - internal error");
                break;
                case 404:
                    response.writeHead(404, {"content-type" : 'text/plain'});
                    response.end("404 - not found");
                break;
                default:
                    response.writeHead(code, {"content-type" : 'text/plain'});
                    response.end(`Error ${code}`)
                break;
            }
        }
    }

    function returnDirectory(directory: string) {
        try {
            const dir = fs.readdirSync(directory);
            dir.forEach(file => {
                const filePath = `${directory}/${file}`
                const stats = fs.statSync(filePath);
                const response_ = `<p id="linkParagraph"><a id="filedirLink" href="http://${request.headers.host}${request.url}${file}${stats.isDirectory() ? '/' : ''}">${file}</a></p>`;
                try {
                    response.write(response_);
                } catch (err) {
                    showError(500, undefined, `while reading ${filePath}`)
                    return;
                }
            });
            response.end(`<p id="endMessage">end of directory listing</p><footer>${config.listingFooter}</footer></body>`);
        } catch (err) {
            showError(500, undefined, `${err}`);
            return;
        }
        }

    // console.log(`Requested ${path_}, accessing ${config.useDefaultPage && request.url == '/' ? defaultPagePath : serversidePath}`)
        if (!finalPath.startsWith(path.normalize(config.serverRoot))) {
            showError(403, undefined, `someone is trying to access files (${finalPath}) outside server root (${config.serverRoot})`)
            return;
        }
        fs.stat(finalPath, (err, stats) => {
            if (err) {
                showError(404, undefined, `while reading ${finalPath}`);
                return;
            }
            if (stats.isDirectory() && config.directoryListing) {
                response.writeHead(200, {"content-type" : 'text/html'});
                var css;
                const goBackLink = path.dirname(request.url || '')
                if(config.listingCSS) {
                    try {
                        const css_ = fs.readFileSync('./custom.css');
                        css = css_;
                    } catch {
                        console.error(`You have CSS enabled, but we're having trouble to read it. You should either disable it in the server config or ensure it exists and is accessible`);
                    }
                }
                response.write(`
                    <!DOCTYPE html>
                    <head>
                        <title>${config.listingTitle}</title>
                        <style>${config.listingCSS ? css : ''}</style>
                    </head>
                    <body>
                    <h1 id="title">listing of ${request.url}</h1>
                    <p id="previousDirectoryParagraph"><a id="previousDirectoryLink" href="http://${request.headers.host}${goBackLink}">go back</a></p>
                    `)
                    try {
                        returnDirectory(finalPath);
                        return;
                    } catch (err) {
                        showError(500);
                        return;
                }
            } else if (stats.isFile()) {
                const extension = path.extname(finalPath)
                const mimeType = mime.getType(extension) || config.defaultToMime;
                response.writeHead(200, {"content-type" : mimeType});
                fs.readFile(finalPath, (err, data) => {
                if (err) {
                    showError(500);
                    return;
                }
                response.end(data);
            })
            return;
            }
            showError(404, undefined, `while reading ${finalPath}`);
        })
}

server.listen(3000, () => {
    console.log("Started at https://localhost:3000")
})