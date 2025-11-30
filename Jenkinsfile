pipeline {
    agent any

    parameters {
        choice(
            name: 'PIPELINE_ACTION',
            choices: [
                'full-deploy',
                'terraform-apply',
                'terraform-destroy',
                'build-only',
                'docker-build-push',
                'k8s-deploy'
            ],
            description: 'Choose what the pipeline will run'
        )
    }

    environment {
        AWS_REGION = "us-east-1"
        ECR_REPO = "hotel-app"
        IMAGE_TAG = "latest"
    }

    stages {

        /* ============================
              BUILD APPLICATION
        ============================== */
        stage('Build Application') {
            when { expression { params.PIPELINE_ACTION in ['build-only','full-deploy'] } }
            steps {
                sh '''
                    echo "🚀 Building Maven project"
                    mvn clean package -DskipTests
                '''
            }
        }

        /* ============================
                DOCKER BUILD & PUSH
        ============================== */
        stage('Docker Build & Push') {
            when { expression { params.PIPELINE_ACTION in ['docker-build-push','full-deploy'] } }
            steps {
                sh '''
                    echo "🔐 Logging into AWS ECR"
                    aws ecr get-login-password --region ${AWS_REGION} \
                        | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

                    echo "🐳 Building Docker image"
                    docker build -t ${ECR_REPO}:${IMAGE_TAG} .

                    echo "🏷 Tagging image"
                    docker tag ${ECR_REPO}:${IMAGE_TAG} ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}

                    echo "⬆️ Pushing image to ECR"
                    docker push ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}
                '''
            }
        }

        /* ============================
                 TERRAFORM APPLY
        ============================== */
        stage('Terraform Init/Apply') {
            when { expression { params.PIPELINE_ACTION in ['terraform-apply','full-deploy'] } }
            steps {
                dir('terraform') {
                    sh '''
                        terraform init
                        terraform validate
                        terraform plan -out tfplan
                        terraform apply -auto-approve
                    '''
                }
            }
        }

        /* ============================
                CONFIGURE KUBECTL
        ============================== */
        stage('Configure kubectl') {
            when { expression { params.PIPELINE_ACTION in ['terraform-apply','full-deploy','k8s-deploy'] } }
            steps {
                dir('terraform') {
                    sh '''
                        echo "📡 Getting EKS cluster name"
                        CLUSTER=$(terraform output -raw cluster_name)
                        
                        echo "🔧 Updating kubeconfig"
                        aws eks update-kubeconfig --region ${AWS_REGION} --name $CLUSTER
                    '''
                }
            }
        }

        /* ============================
                K8S DEPLOYMENT
        ============================== */
        stage('Kubernetes Deploy') {
            when { expression { params.PIPELINE_ACTION in ['full-deploy','k8s-deploy'] } }
            steps {
                dir('k8s') {
                    sh '''
                        echo "📦 Applying Kubernetes manifests"
                        kubectl apply -f deployment.yaml -n hotel-app
                        kubectl apply -f service.yaml -n hotel-app
                        kubectl apply -f ingress.yaml -n hotel-app
                    '''
                }
            }
        }

        /* ============================
               APPLY SECURITY POLICIES
        ============================== */
        stage('Deploy Security Policies') {
            when { expression { params.PIPELINE_ACTION in ['full-deploy'] } }
            steps {
                dir('k8s') {
                    sh '''
                        kubectl apply -f security/network-policies.yaml -n hotel-app
                        kubectl apply -f security/pod-security.yaml -n hotel-app
                        kubectl apply -f auto-scaling/hpa.yaml -n hotel-app
                    '''
                }
            }
        }

        /* ============================
                 VERIFY DEPLOYMENT
        ============================== */
        stage('Verify Deployment') {
            when { expression { params.PIPELINE_ACTION in ['full-deploy','k8s-deploy'] } }
            steps {
                sh '''
                    kubectl get pods -n hotel-app
                    kubectl get svc -n hotel-app
                    kubectl get ingress -n hotel-app
                '''
            }
        }

        /* ============================
                TERRAFORM DESTROY
        ============================== */
        stage('Terraform Destroy') {
            when { expression { params.PIPELINE_ACTION == 'terraform-destroy' } }
            steps {
                input message: '⚠️ Destroy ALL resources?', ok: 'Destroy'
                dir('terraform') {
                    sh '''
                        terraform destroy -auto-approve
                    '''
                }
            }
        }
    }

    post {
        always {
            echo "🏁 Pipeline finished."
        }
        success {
            echo "✅ SUCCESS"
        }
        failure {
            echo "❌ FAILED"
        }
    }
}
