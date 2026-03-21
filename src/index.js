import dotenv from 'dotenv';
dotenv.config();

import bodyParser from 'body-parser';
import express from 'express';
import AppDataSource from '../ormconfig.js';

import apiRoutes from './routes/index.js';

import errorHandlerMiddleware from './middleware/errorHandler.js';

let app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json({
    limit: "100kb"
}));

AppDataSource.initialize().then(async () => {
    // Routes
    app.use('/api', apiRoutes);
    app.use(errorHandlerMiddleware);

    app.get('/', (req, res) => {
        res.send('Hello World');
    });

    app.get('/health', (req, res) => {
        res.status(200).send('Server is healthy!');
    });

    process.on('uncaughtException', function (error) {
        console.error("Unhandled exception", error);
    });

    // Start the server
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}).catch(error => console.log('top level error: ', error));