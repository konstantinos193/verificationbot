const { POINTS } = require('../config');

class PointsSystem {
    constructor() {
        this.userPoints = new Map();
    }

    addPoints(userId, activity) {
        const currentPoints = this.userPoints.get(userId) || 0;
        let pointsToAdd = 0;

        switch (activity) {
            case 'SUCCESSFUL_CALL':
                pointsToAdd = POINTS.SUCCESSFUL_CALL;
                break;
            case 'PARTIAL_SUCCESS':
                pointsToAdd = POINTS.PARTIAL_SUCCESS;
                break;
            case 'RESEARCH_CONTRIBUTION':
                pointsToAdd = POINTS.RESEARCH_CONTRIBUTION;
                break;
            default:
                pointsToAdd = 0;
        }

        this.userPoints.set(userId, currentPoints + pointsToAdd);
        return currentPoints + pointsToAdd;
    }

    getPoints(userId) {
        return this.userPoints.get(userId) || 0;
    }

    getLeaderboard(limit = 10) {
        return Array.from(this.userPoints.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit);
    }
}

module.exports = new PointsSystem(); 