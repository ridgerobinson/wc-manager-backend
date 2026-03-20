import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { Router } from 'express';

import { commitTransaction, rollbackTransaction, StartPool, StartPT } from '../../database/database.js';

async function UserCheck({ pool, Email }) {
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [Email]);

    return userCheck.rows;
}

async function login(args) {
    try {
        var { Email, Password } = args;

        var pool = await StartPool();

        // Check if the user already exists
            var MatchingUsers = await UserCheck({ pool, Email });
            if (MatchingUsers.length === 0) throw new Error('Invalid email or password');
            var { password: SavedPassword, ...rest } = MatchingUsers[0];

        // Match Passwords
            const isMatch = await bcrypt.compare(Password, SavedPassword);
            if (!isMatch) throw new Error('Invalid email or password');

        // Generate a JWT
            const accessToken = jwt.sign({ UserId: MatchingUsers[0].id }, process.env.JWT_SECRET, { expiresIn: '1y' });

        return ({ Response: 1, accessToken, UserDetails: { ...rest } });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

async function register(args) {
    async function insertUserQuery({ pool, Email, FirstName, LastName, Password }) {
        var result = await pool.query('INSERT INTO users (firstname, lastname, email, password) VALUES ($1, $2, $3, $4) RETURNING *', [FirstName, LastName, Email, Password]);
    
        if (result.rowCount === 0) {
            throw new Error('Error adding user');
        }
    
        return result.rows[0];
    }

    try {
        var { Email, FirstName, LastName, Password } = args;

        var pool = await StartPT();

        // Check if the user already exists
            var MatchingUsers = await UserCheck({ pool, Email });
            if (MatchingUsers.length > 0) throw new Error('User already exists');

        // Hash Password
            const hashedPassword = await bcrypt.hash(Password, 10);

        // Insert the new user into the database
            var NewUser = await insertUserQuery({ pool, Email, FirstName, LastName, Password: hashedPassword });
            var { Password, ...rest } = NewUser;

        // Generate a JWT
            const token = jwt.sign({ UserId: NewUser.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        await commitTransaction(pool);

        return ({ Response: 1, token, User: { ...rest } });
    } catch (err) {
        console.error(err);
        await rollbackTransaction(pool);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

export var authController = () => {
    let api = Router();

    api.post('/login', (req, res) => {
        var Email = req.body.Email;
        var Password = req.body.Password;

        login({ Email, Password }).then(result => {
            res.send(result);
        })
    });

    api.post('/register', (req, res) => {
        var Email = req.body.Email;
        var FirstName = req.body.FirstName;
        var LastName = req.body.LastName;
        var Password = req.body.Password;

        register({ Email, FirstName, LastName, Password }).then(result => {
            res.send(result);
        })
    });

    return api;
}