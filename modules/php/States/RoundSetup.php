<?php

declare(strict_types=1);

namespace Bga\Games\Scoop\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\Scoop\Cards;
use Bga\Games\Scoop\Game;

class RoundSetup extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            id: 5,
            type: StateType::GAME,
        );
    }

    public function onEnteringState(): string
    {
        $this->game->setupRound();

        $starterId = (int) $this->game->getGameStateValue('starter_player_id');
        $this->game->gamestate->changeActivePlayer($starterId);

        return PlayerTurn::class;
    }
}
