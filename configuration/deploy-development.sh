#! /bin/bash

npm install -g serverless
npm install -g serverless-plugin-split-stacks@1.9.3
echo $CODEBUILD_SRC_DIR/target/$env
if [ $env == "development" ]
then
    echo "Deploy development"
    serverless deploy --stage development --package $CODEBUILD_SRC_DIR/target/development --verbose -r eu-west-3
else
    echo "Not development env"
fi