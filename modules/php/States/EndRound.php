<?php

declare(strict_types=1);

namespace Bga\Games\Scoop\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\Scoop\Game;

class EndRound extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            id: 95,
            type: StateType::GAME,
            updateGameProgression: true,
        );
    }

    public function onEnteringState(): string
    {
        $gameOver = $this->game->scoreRoundAndAdvance();

        if ($gameOver) {
            return EndScore::class;
        }

        return RoundSetup::class;
    }
}
