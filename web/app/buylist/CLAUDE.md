# web/app/buylist/ — Buy-list route

`page.tsx` runs `@engine/buylist/build.buildBuyList` over demo candidates ($2,500, $100
min lot) and renders the ranked, governed allocation + the governor reason per row +
the residual cash line. Includes the no-execution disclaimer.
