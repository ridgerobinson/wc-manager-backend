const errorHandlerMiddleware = (error, req, res, next) => {
    console.error(error);
    res.status(500).json({ Response: 0, Error: 'An error occurred', error });
};

export default errorHandlerMiddleware;