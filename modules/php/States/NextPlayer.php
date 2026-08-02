<?php

declare(strict_types=1);

namespace Bga\Games\Scoop\States;

use Bga\GameFramework\StateType;
use Bga\Games\Scoop\Game;

class NextPlayer extends \Bga\GameFramework\States\GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            id: 90,
            type: StateType::GAME,
            updateGameProgression: true,
        );
    }

    public function onEnteringState(int $activePlayerId): string
    {
        $this->game->giveExtraTime($activePlayerId);

        if ((int) $this->game->getGameStateValue('in_final_turns') === 1) {
            $wentOutId = (int) $this->game->getGameStateValue('went_out_player_id');
            $nextTable = $this->game->getNextPlayerTable();
            $nextPlayerId = $nextTable[$activePlayerId];

            if ($nextPlayerId === $wentOutId) {
                return EndRound::class;
            }
        }

        $this->game->activeNextPlayer();

        return PlayerTurn::class;
    }
}
