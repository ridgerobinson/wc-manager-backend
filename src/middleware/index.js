import { Router } from 'express';

export default () => {
    let api = Router();

    // Add Middleware
    api.use(function (req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id");
        res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, GET, DELETE, OPTIONS');
        next();
    });

    return api;
}