<?php

declare(strict_types=1);

namespace Bga\Games\Scoop\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\GameResult\GameResult;
use Bga\GameFramework\GameResult\Player;
use Bga\Games\Scoop\Game;

class EndScore extends \Bga\GameFramework\States\GameState
{
    function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            id: 98,
            type: StateType::GAME,
        );
    }

    /**
     * Final ranking: lowest penalty score wins.
     */
    public function onEnteringState()
    {
        $playersDb = $this->game->getCollectionFromDb('SELECT * FROM `player`');
        $players = Player::fromPlayersDb($playersDb);

        // Migrate any in-progress tables that still used negative scores
        if ($this->bga->playerScore->getMin() < 0) {
            foreach ($players as &$player) {
                $player->score = -$player->score;
            }
            unset($player);
        }

        return GameResult::individualRanking($players, reverseScore: true);
    }
}
