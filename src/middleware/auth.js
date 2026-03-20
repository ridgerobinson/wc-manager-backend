import jwt from 'jsonwebtoken';

const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ Response: 0, Error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.body.UserId = decoded.UserId;

        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

export default authenticate;
