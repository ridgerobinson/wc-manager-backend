import { Router } from 'express';

import authenticate from '../middleware/auth.js';
import { StartPool } from '../../database/database.js';

async function getProfile(args) {
    async function getProfile_Query({ pool, UserId }) {
        var result = await pool.query('SELECT id, firstname, lastname, email FROM users WHERE id = $1', [UserId]);

        if (result.rows.length === 0) throw new Error('User does not exist');

        return result.rows[0];
    }

    try {
        var { UserId } = args;

        var pool = await StartPool();

        var UserDetails = await getProfile_Query({ pool, UserId });

        return ({ Response: 1, UserDetails });
    } catch (err) {
        console.error(err);
        return ({ Response: 0, Error: err.message });
    } finally {
        if (pool) pool.release();
    }
}

export var usersController = () => {
    let api = Router();

    api.get('/profile', authenticate, (req, res) => {
        var UserId = req.body.UserId;

        getProfile({ UserId }).then(result => {
            res.send(result);
        })
    });

    return api;
}