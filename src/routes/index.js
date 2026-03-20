import express from 'express';
import middleware from '../middleware/index.js';

import { authController } from '../controllers/auth.js';
import { clubsController } from '../controllers/clubs.js';
import { competitionsController } from '../controllers/competitions.js';
import { eventsController } from '../controllers/events.js';
import { locationsController } from '../controllers/locations.js';
import { matchesController } from '../controllers/matches.js';
import { seasonsController } from '../controllers/seasons.js';
import { statsController } from '../controllers/stats.js';
import { playersController } from '../controllers/players.js';
import { teamsController } from '../controllers/teams.js';
import { usersController } from '../controllers/users.js';

let router = express();

router.use(middleware());

router.use('/auth', authController());
router.use('/clubs', clubsController());
router.use('/competitions', competitionsController());
router.use('/events', eventsController());
router.use('/locations', locationsController());
router.use('/matches', matchesController());
router.use('/players', playersController());
router.use('/seasons', seasonsController());
router.use('/stats', statsController());
router.use('/teams', teamsController());
router.use('/users', usersController());

export default router;