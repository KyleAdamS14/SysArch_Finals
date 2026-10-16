   #!/bin/sh
   # Frontend smoke test. Runs INSIDE the proxy container, the same way Jenkins does,
   # so it tests the real entry point: proxy -> frontend / team-api.
   # Usage:  docker compose exec -T proxy sh < frontend/smoke-test.sh
   BASE=http://127.0.0.1:8080
   fail=0

   check() {   # check <path> <text that must appear in the response>
     if wget -qO- "$BASE$1" 2>/dev/null | grep -q "$2"; then
       echo "OK    $1"
     else
       echo "FAIL  $1"
       fail=1
     fi
   }

   check /             "Pokemon Team Tracker"   # frontend home page via proxy
   check /edit.html    "Edit Pokemon"           # second page
   check /version.json '"build"'                # build number file
   check /api/pokemon  '\['                     # team-api returns a JSON array via proxy

   if [ "$fail" -eq 0 ]; then echo "Frontend smoke test PASSED"; else echo "Frontend smoke test FAILED"; fi
   exit $fail
