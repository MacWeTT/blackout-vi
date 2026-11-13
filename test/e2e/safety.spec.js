const { test, expect, addTile, stateOf } = require('./fixtures');

const TAG = 'ytd-rich-item-renderer';
const FIRST = '#feed > :first-child';

// The hard requirement: a spoiler must never be visible, not even for one frame.
const startLeakSampler = page => {
  return page.evaluate(() => {
    window.__leaks = [];

    const sample = () => {
      for (const el of document.getElementById('feed').children) {
        const unmarked = !el.hasAttribute('data-gv-ok') && !el.hasAttribute('data-gv-blocked');
        const visible = getComputedStyle(el).opacity !== '0';

        if (/ending|dies/i.test(el.textContent) && unmarked && visible) {
          window.__leaks.push(el.textContent);
        }
      }

      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  });
};

test('a spoiler tile is never visible before it is classified', async ({ openFixture }) => {
  const page = await openFixture();

  await startLeakSampler(page);

  for (let i = 0; i < 10; i++) {
    await addTile(page, TAG, `GTA 6 ending number ${i}`);
  }

  await page.waitForTimeout(500);
  expect(
    await page.evaluate(() => {
      return window.__leaks;
    }),
  ).toEqual([]);
});

test('a tile with no text yet stays hidden, then is classified once the title arrives', async ({ openFixture }) => {
  const page = await openFixture();

  await addTile(page, TAG, '');
  await page.waitForTimeout(2500); // longer than the 2s backstop sweep: no timeout may reveal it

  expect(await stateOf(page, 0)).toBe('pending');
  expect(
    await page.evaluate(() => {
      return getComputedStyle(document.getElementById('feed').children[0]).opacity;
    }),
  ).toBe('0');

  await page.evaluate(() => {
    document.getElementById('feed').children[0].textContent = 'GTA 6 ending explained';
  });
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');
});

test('a title that changes later (tile reuse) is re-judged', async ({ openFixture }) => {
  const page = await openFixture();

  await addTile(page, TAG, 'Cooking pasta');
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('ok');
  await page.evaluate(() => {
    document.getElementById('feed').children[0].textContent = 'GTA 6 ending explained';
  });
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');
});

test('a blocked tile shows the card with its hint', async ({ openFixture }) => {
  const page = await openFixture();

  await addTile(page, TAG, 'GTA 6 ending explained');
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');
  await expect(page.locator('#feed > :first-child > .gv-card')).toBeVisible();

  const hint = await page.evaluate(() => {
    return getComputedStyle(document.querySelector('.gv-card__hint'), '::before').content;
  });

  expect(hint).toContain('Click to reveal');
});

test('clicking a blocked tile reveals it and does not navigate', async ({ openFixture }) => {
  const page = await openFixture();

  await page.evaluate(() => {
    const tile = document.createElement('ytd-rich-item-renderer');

    tile.innerHTML = '<a href="/watch?v=abc" id="link">GTA 6 ending explained</a>';
    document.getElementById('feed').append(tile);
  });
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');

  const url = page.url();

  await page.locator(FIRST).click({ position: { x: 20, y: 20 } });
  await expect(page.locator(FIRST)).toHaveAttribute('data-gv-shown', '');
  expect(page.url()).toBe(url);

  const visibility = await page.evaluate(() => {
    return getComputedStyle(document.getElementById('link')).visibility;
  });

  expect(visibility).toBe('visible');
});

test('a revealed tile stays revealed through later sweeps', async ({ openFixture }) => {
  const page = await openFixture();

  await addTile(page, TAG, 'GTA 6 ending explained');
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');
  await page.locator(FIRST).click({ position: { x: 20, y: 20 } });
  await page.waitForTimeout(2500);
  await expect(page.locator(FIRST)).toHaveAttribute('data-gv-shown', '');
});

test('a video that starts playing inside a hidden tile is paused', async ({ openFixture }) => {
  const page = await openFixture();

  await page.evaluate(() => {
    const tile = document.createElement('ytd-rich-item-renderer');

    tile.innerHTML = '<video id="v" muted></video>';
    document.getElementById('feed').append(tile);
  });
  await page.waitForTimeout(300);

  const paused = await page.evaluate(() => {
    const video = document.getElementById('v');

    video.dispatchEvent(new Event('play'));

    return video.paused;
  });

  expect(paused).toBe(true);
});

// YouTube skips rendering lazy home-feed tiles that are visibility:hidden, so they never receive a title.
test('a pending tile is hidden with opacity, never visibility:hidden or display:none', async ({ openFixture }) => {
  const page = await openFixture();

  await addTile(page, TAG, '');
  await page.waitForTimeout(300);

  const style = await page.evaluate(() => {
    const css = getComputedStyle(document.getElementById('feed').children[0]);

    return { opacity: css.opacity, visibility: css.visibility, display: css.display };
  });

  expect(style).toEqual({ opacity: '0', visibility: 'visible', display: 'block' });
});

test('the card names the kind of spoiler and shows the logo', async ({ openFixture }) => {
  const page = await openFixture({ level: 'nothing' });
  const kinds = [
    ['GTA 6 ending explained', 'Story spoiler'],
    ['GTA 6 gameplay first hour', 'Gameplay spoiler'],
    ['GTA 6 trailer', 'GTA VI content'],
  ];

  for (const [title] of kinds) {
    await addTile(page, TAG, title);
  }

  for (let i = 0; i < kinds.length; i++) {
    await expect
      .poll(() => {
        return stateOf(page, i);
      })
      .toBe('blocked');

    const card = await page.evaluate(index => {
      const tile = document.getElementById('feed').children[index];

      return {
        kind: tile.querySelector('.gv-card__kind').dataset.kind,
        logo: getComputedStyle(tile.querySelector('.gv-card__logo')).backgroundImage,
      };
    }, i);

    expect(card.kind).toBe(kinds[i][1]);
    expect(card.logo).toContain('gta-vi-logo.png');
  }

  // the text and logo scale with the card's own size
  const sizes = [
    [168, 94],
    [440, 248],
    [700, 394],
  ];
  const fonts = [];

  for (const [width, height] of sizes) {
    await page.addStyleTag({ content: `#feed > * { width: ${width}px !important; height: ${height}px !important; }` });
    await page.waitForTimeout(150);
    fonts.push(
      await page.evaluate(() => {
        return parseFloat(getComputedStyle(document.querySelector('.gv-card__hint')).fontSize);
      }),
    );
    await page.locator('#feed > :first-child').screenshot({ path: `test-results/card-${width}.png` });
  }

  expect(fonts[0]).toBeLessThan(fonts[1]);
  expect(fonts[1]).toBeLessThan(fonts[2]);
});

test('the card logo and background actually load from the extension', async ({ openFixture }) => {
  const page = await openFixture();
  const errors = [];

  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  await addTile(page, TAG, 'GTA 6 ending explained');
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');
  const logo = await page.evaluate(async () => {
    const image = getComputedStyle(document.querySelector('.gv-card__logo')).backgroundImage;
    const response = await fetch(image.match(/url\("?([^")]+)"?\)/)[1]);

    return response.ok;
  });

  expect(logo).toBe(true);

  const background = await page.evaluate(async () => {
    const url = getComputedStyle(document.querySelector('.gv-card')).backgroundImage.match(/url\("?([^")]+)"?\)/)[1];
    const response = await fetch(url);

    return response.ok;
  });

  expect(background).toBe(true);
  expect(
    errors.filter(text => {
      return /Unsafe attempt to load URL/.test(text);
    }),
  ).toEqual([]);
});
