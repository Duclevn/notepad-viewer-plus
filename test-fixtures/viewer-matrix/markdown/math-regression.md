# KaTeX geometry regression

Inline square root: $\sqrt{x^2 + y^2}$ should keep its radical and overbar.

Display square root:

$$
\sqrt{x^2 + y^2}
$$

The inline overbrace $\overbrace{a+b+c}^{\text{grouped terms}}$ and vector
$\vec{v}$ should keep their generated SVG geometry.

Neighboring fraction and integral:

$$
\frac{1}{2} \qquad \int_0^1 x^2\,dx
$$

This intentionally invalid formula should fail locally:
$\htmlClass{unsafe}{x}$.

This paragraph follows the invalid formula and must remain readable. The
renderer should isolate the math error instead of dropping the surrounding
Markdown content.
